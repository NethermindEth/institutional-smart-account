import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Three Level Flow - Integration Tests", () => {
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

  it("Should complete full 3-level flow with correct quorums", async () => {
    const amount = ethers.parseEther("2000000");
    const value = ethers.parseEther("200");
    const txHash = await proposeTransaction(amount, value);

    // Verify initial state
    expect(await account.currentLevelIndex(txHash)).to.equal(0n);
    expect(await account.fullyApproved(txHash)).to.be.false;

    // Level 1: 3-of-3 required
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);
    await level1.connect(fixture.ops3).sign(txHash);

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash);

    // Verify Level 1 completed
    expect(await account.currentLevelIndex(txHash)).to.equal(1n);

    // Level 2: 2-of-2 required
    await level2.connect(fixture.comp1).sign(txHash);
    await level2.connect(fixture.comp2).sign(txHash);

    await ethers.provider.send("evm_increaseTime", [7201]);
    await ethers.provider.send("evm_mine", []);
    await level2.completeTimelock(txHash);

    // Verify Level 2 completed
    expect(await account.currentLevelIndex(txHash)).to.equal(2n);

    // Level 3: 1-of-1 required
    // Wait a bit to ensure level3 was submitted by the callback
    let level3State = await level3.getApprovalState(txHash);
    let attempts = 0;
    while (!level3State.submitted && attempts < 10) {
      await ethers.provider.send("evm_mine", []);
      level3State = await level3.getApprovalState(txHash);
      attempts++;
    }
    expect(level3State.submitted).to.be.true;
    
    await level3.connect(fixture.exec).sign(txHash);

    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);
    await level3.completeTimelock(txHash);

    // Verify fully approved
    expect(await account.fullyApproved(txHash)).to.be.true;

    // Execute - ensure account has enough balance
    const accountBalance = await ethers.provider.getBalance(await account.getAddress());
    if (accountBalance < value) {
      // Fund account if needed
      const ownerBalance = await ethers.provider.getBalance(owner.address);
      if (ownerBalance > value + ethers.parseEther("1")) {
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: value + ethers.parseEther("1")
        });
      }
    }
    
    const balanceBefore = await ethers.provider.getBalance(recipient.address);
    await account.executeApprovedTransaction(txHash);
    const balanceAfter = await ethers.provider.getBalance(recipient.address);

    expect(balanceAfter - balanceBefore).to.equal(value);
  });

  it("Should emit LevelCompleted events for each level", async () => {
    const amount = ethers.parseEther("2000000");
    const value = ethers.parseEther("200");
    const txHash = await proposeTransaction(amount, value);

    // Level 1
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);
    await level1.connect(fixture.ops3).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash);

    // Check LevelCompleted event
    const filter1 = account.filters.LevelCompleted(txHash, 1n);
    const events1 = await account.queryFilter(filter1);
    expect(events1.length).to.be.greaterThan(0);

    // Level 2
    await level2.connect(fixture.comp1).sign(txHash);
    await level2.connect(fixture.comp2).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [7201]);
    await ethers.provider.send("evm_mine", []);
    await level2.completeTimelock(txHash);

    const filter2 = account.filters.LevelCompleted(txHash, 2n);
    const events2 = await account.queryFilter(filter2);
    expect(events2.length).to.be.greaterThan(0);

    // Level 3
    await level3.connect(fixture.exec).sign(txHash);
    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);
    await level3.completeTimelock(txHash);

    // Check ReadyForExecution event
    const filter3 = account.filters.ReadyForExecution(txHash);
    const events3 = await account.queryFilter(filter3);
    expect(events3.length).to.be.greaterThan(0);
  });
});

