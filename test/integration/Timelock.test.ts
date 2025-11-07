import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Timelock - Integration Tests", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let entryPoint: IEntryPoint;
  let level1: Level;
  let level2: Level;
  let level3: Level;
  let owner: any;
  let recipient: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    entryPoint = fixture.entryPoint;
    level1 = fixture.level1;
    level2 = fixture.level2;
    level3 = fixture.level3;
    owner = fixture.owner;
    recipient = fixture.others[0];
  });

  async function proposeTransaction(amount: bigint, value: bigint) {
    // Always ensure sufficient balance for gas
    const accountBalance = await ethers.provider.getBalance(await account.getAddress());
    const ownerBalance = await ethers.provider.getBalance(owner.address);
    
    if (accountBalance < ethers.parseEther("10000") && ownerBalance > ethers.parseEther("20000")) {
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("10000")
      });
    }

    const to = recipient.address;
    const data = "0x";
    const nonce = await account.nonce();
    const callData = account.interface.encodeFunctionData("execute", [
      to,
      value,
      data,
      amount
    ]);

    const userOp = createUserOp({
      sender: await account.getAddress(),
      nonce,
      callData
    });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    const signature = await signUserOp(userOp, owner, await entryPoint.getAddress(), chainId);
    userOp.signature = signature;

    await entryPoint.handleOps([userOp], owner.address);

    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    return events[events.length - 1].args[0]; // txHash
  }

  it("Should enforce timelock before approval", async () => {
    const amount = ethers.parseEther("5000");
    const value = ethers.parseEther("10");
    const txHash = await proposeTransaction(amount, value);

    // Sign to reach quorum
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);

    // Try to complete timelock immediately (should fail)
    await expect(
      level1.completeTimelock(txHash)
    ).to.be.revertedWithCustomError(level1, "TimelockActive");

    // Fast forward time
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    // Now should succeed
    await level1.completeTimelock(txHash);
    const state = await level1.getApprovalState(txHash);
    expect(state.approved).to.be.true;
  });

  it("Should track timelock remaining correctly", async () => {
    const amount = ethers.parseEther("5000");
    const value = ethers.parseEther("10");
    const txHash = await proposeTransaction(amount, value);

    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);

    // Check initial timelock
    const remaining1 = await level1.getTimelockRemaining(txHash);
    expect(remaining1).to.be.greaterThan(0n);
    expect(remaining1).to.be.lessThanOrEqual(3600n);

    // Fast forward half the timelock
    await ethers.provider.send("evm_increaseTime", [1800]);
    await ethers.provider.send("evm_mine", []);

    const remaining2 = await level1.getTimelockRemaining(txHash);
    expect(remaining2).to.be.lessThan(remaining1);
    expect(remaining2).to.be.lessThanOrEqual(1800n);

    // Fast forward past expiry
    await ethers.provider.send("evm_increaseTime", [1801]);
    await ethers.provider.send("evm_mine", []);

    const remaining3 = await level1.getTimelockRemaining(txHash);
    expect(remaining3).to.equal(0n);
  });

  it("Should handle zero timelock duration", async () => {
    // Configure a range with zero timelock
    await account.connect(owner).configureAmountRange(
      ethers.parseEther("20000"),
      ethers.parseEther("30000"),
      [1],
      [2],
      [0] // No timelock
    );

    const amount = ethers.parseEther("25000");
    const value = ethers.parseEther("25");
    const txHash = await proposeTransaction(amount, value);

    // Sign to reach quorum
    await level1.connect(fixture.ops1).sign(txHash);
    const tx = await level1.connect(fixture.ops2).sign(txHash);
    const receipt = await tx.wait();

    // Should approve immediately (no timelock)
    const approvedEvent = receipt?.logs
      .map((log) => {
        try {
          return level1.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "LevelApproved");

    expect(approvedEvent).to.not.be.null;
  });

  it("Should enforce sequential timelocks across levels", async () => {
    const amount = ethers.parseEther("2000000");
    const value = ethers.parseEther("200");
    const txHash = await proposeTransaction(amount, value);

    // Level 1: 1 hour timelock
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);
    await level1.connect(fixture.ops3).sign(txHash);

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash);

    // Level 2: 2 hour timelock
    await level2.connect(fixture.comp1).sign(txHash);
    await level2.connect(fixture.comp2).sign(txHash);

    // Try to complete too early
    await expect(
      level2.completeTimelock(txHash)
    ).to.be.revertedWithCustomError(level2, "TimelockActive");

    await ethers.provider.send("evm_increaseTime", [7201]);
    await ethers.provider.send("evm_mine", []);
    await level2.completeTimelock(txHash);

    // Level 3: 24 hour timelock
    await level3.connect(fixture.exec).sign(txHash);

    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);
    await level3.completeTimelock(txHash);

    // Now should be ready for execution
    expect(await account.fullyApproved(txHash)).to.be.true;
  });
});

