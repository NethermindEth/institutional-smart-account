import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Denial Mechanics - Integration Tests", () => {
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

  it("Should cancel if Level 1 denies", async () => {
    const amount = ethers.parseEther("500000");
    const value = ethers.parseEther("100");
    const txHash = await proposeTransaction(amount, value);

    // Level 1 denies
    await level1.connect(fixture.ops1).deny(txHash);

    // Verify transaction is denied
    const state = await level1.getApprovalState(txHash);
    expect(state.denied).to.be.true;

    // Verify transaction cannot be executed
    await expect(
      account.executeApprovedTransaction(txHash)
    ).to.be.revertedWithCustomError(account, "NotFullyApproved");
  });

  it("Should cancel if Level 2 denies after Level 1 approval", async () => {
    const amount = ethers.parseEther("50000");
    const value = ethers.parseEther("50");
    const txHash = await proposeTransaction(amount, value);

    // Level 1 approves
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash);

    // Level 2 denies
    await level2.connect(fixture.comp1).deny(txHash);

    // Verify transaction is denied
    const state = await level2.getApprovalState(txHash);
    expect(state.denied).to.be.true;

    // Verify transaction cannot be executed
    await expect(
      account.executeApprovedTransaction(txHash)
    ).to.be.revertedWithCustomError(account, "NotFullyApproved");
  });

  it("Should cancel if Level 3 denies after Level 1+2 approval", async () => {
    const amount = ethers.parseEther("2000000");
    const value = ethers.parseEther("200");
    const txHash = await proposeTransaction(amount, value);

    // Level 1 approves
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);
    await level1.connect(fixture.ops3).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash);

    // Level 2 approves
    await level2.connect(fixture.comp1).sign(txHash);
    await level2.connect(fixture.comp2).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [7201]);
    await ethers.provider.send("evm_mine", []);
    await level2.completeTimelock(txHash);

    // Level 3 denies
    await level3.connect(fixture.exec).deny(txHash);

    // Verify transaction is denied
    const state = await level3.getApprovalState(txHash);
    expect(state.denied).to.be.true;

    // Verify transaction cannot be executed
    await expect(
      account.executeApprovedTransaction(txHash)
    ).to.be.revertedWithCustomError(account, "NotFullyApproved");
  });

  it("Should emit correct events on denial", async () => {
    const amount = ethers.parseEther("5000");
    const value = ethers.parseEther("10");
    const txHash = await proposeTransaction(amount, value);

    const tx = await level1.connect(fixture.ops1).deny(txHash);
    const receipt = await tx.wait();

    // Check for Denied event
    const deniedEvent = receipt?.logs
      .map((log) => {
        try {
          return level1.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "Denied");

    expect(deniedEvent).to.not.be.null;

    // Check for TransactionDenied event from account
    const filter = account.filters.TransactionDenied();
    const events = await account.queryFilter(filter, receipt?.blockNumber);
    expect(events.length).to.be.greaterThan(0);
  });
});

