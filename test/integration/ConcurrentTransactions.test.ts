import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Concurrent Transactions - Integration Tests", () => {
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
    
    // Ensure owner has enough funds for all tests
    // Hardhat gives each account 10000 ETH, but concurrent tests need much more
    // The issue is that these tests propose multiple large transactions which require significant gas
    // We'll use Hardhat's setBalance to directly set the balance instead of transferring
    const requiredBalance = ethers.parseEther("200000"); // Need 200k ETH for concurrent tests
    
    // Use Hardhat's setBalance to directly fund the owner
    await ethers.provider.send("hardhat_setBalance", [
      owner.address,
      "0x" + requiredBalance.toString(16)
    ]);
    
    // Verify the balance was set
    const finalBalance = await ethers.provider.getBalance(owner.address);
    if (finalBalance < requiredBalance) {
      // Fallback to transfers if setBalance doesn't work
      const signers = await ethers.getSigners();
      const needed = requiredBalance - finalBalance;
      let transferred = 0n;
      
      for (let i = 1; i < signers.length && transferred < needed; i++) {
        const funder = signers[i];
        if (funder.address !== owner.address) {
          const funderBalance = await ethers.provider.getBalance(funder.address);
          if (funderBalance > ethers.parseEther("10000")) {
            const remaining = needed - transferred;
            const transferAmount = remaining > ethers.parseEther("10000") 
              ? ethers.parseEther("10000") 
              : remaining;
            
            try {
              const tx = await funder.sendTransaction({
                to: owner.address,
                value: transferAmount
              });
              await tx.wait();
              transferred += transferAmount;
            } catch (e) {
              // Continue to next funder
            }
          }
        }
      }
    }
  });

  async function proposeTransaction(amount: bigint, value: bigint) {
    // Always ensure sufficient balance for gas
    const accountBalance = await ethers.provider.getBalance(await account.getAddress());
    const ownerBalance = await ethers.provider.getBalance(owner.address);
    
    // Ensure we have enough funds - check both account and owner
    if (accountBalance < ethers.parseEther("20000")) {
      // Need to fund account, but first check if owner has enough
      if (ownerBalance > ethers.parseEther("30000")) {
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: ethers.parseEther("20000")
        });
      } else {
        // Owner is low - try to get funds from another account
        const [, , , , , , , funder] = await ethers.getSigners();
        if (funder && funder.address !== owner.address) {
          await funder.sendTransaction({
            to: owner.address,
            value: ethers.parseEther("50000")
          });
          await owner.sendTransaction({
            to: await account.getAddress(),
            value: ethers.parseEther("20000")
          });
        }
      }
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

  it("Should handle 3 transactions at different levels independently", async () => {
    // Tx1: $5k at Level 1
    const txHash1 = await proposeTransaction(ethers.parseEther("5000"), ethers.parseEther("10"));
    
    // Tx2: $50k at Level 2
    const txHash2 = await proposeTransaction(ethers.parseEther("50000"), ethers.parseEther("50"));
    
    // Tx3: $2M at Level 3
    const txHash3 = await proposeTransaction(ethers.parseEther("2000000"), ethers.parseEther("200"));

    // Progress Tx1 through Level 1
    await level1.connect(fixture.ops1).sign(txHash1);
    await level1.connect(fixture.ops2).sign(txHash1);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash1);

    // Progress Tx2 through Level 1
    await level1.connect(fixture.ops1).sign(txHash2);
    await level1.connect(fixture.ops2).sign(txHash2);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash2);

    // Progress Tx2 through Level 2
    await level2.connect(fixture.comp1).sign(txHash2);
    await level2.connect(fixture.comp2).sign(txHash2);
    await ethers.provider.send("evm_increaseTime", [7201]);
    await ethers.provider.send("evm_mine", []);
    await level2.completeTimelock(txHash2);

    // Progress Tx3 through Level 1
    await level1.connect(fixture.ops1).sign(txHash3);
    await level1.connect(fixture.ops2).sign(txHash3);
    await level1.connect(fixture.ops3).sign(txHash3);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash3);

    // Verify all transactions are at expected states
    expect(await account.fullyApproved(txHash1)).to.be.true;
    expect(await account.fullyApproved(txHash2)).to.be.true;
    expect(await account.fullyApproved(txHash3)).to.be.false; // Still in Level 2

    // Execute Tx1 and Tx2
    const balanceBefore = await ethers.provider.getBalance(recipient.address);
    await account.executeApprovedTransaction(txHash1);
    await account.executeApprovedTransaction(txHash2);
    const balanceAfter = await ethers.provider.getBalance(recipient.address);
    
    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("60")); // 10 + 50
  });

  it("Should handle multiple transactions at same level", async () => {
    const txHash1 = await proposeTransaction(ethers.parseEther("5000"), ethers.parseEther("10"));
    const txHash2 = await proposeTransaction(ethers.parseEther("5000"), ethers.parseEther("20"));
    const txHash3 = await proposeTransaction(ethers.parseEther("5000"), ethers.parseEther("30"));

    // All three are at Level 1
    // Sign all three
    await level1.connect(fixture.ops1).sign(txHash1);
    await level1.connect(fixture.ops1).sign(txHash2);
    await level1.connect(fixture.ops1).sign(txHash3);

    await level1.connect(fixture.ops2).sign(txHash1);
    await level1.connect(fixture.ops2).sign(txHash2);
    await level1.connect(fixture.ops2).sign(txHash3);

    // Complete all timelocks
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    
    await level1.completeTimelock(txHash1);
    await level1.completeTimelock(txHash2);
    await level1.completeTimelock(txHash3);

    // All should be approved
    expect(await account.fullyApproved(txHash1)).to.be.true;
    expect(await account.fullyApproved(txHash2)).to.be.true;
    expect(await account.fullyApproved(txHash3)).to.be.true;

    // Execute all
    const balanceBefore = await ethers.provider.getBalance(recipient.address);
    await account.executeApprovedTransaction(txHash1);
    await account.executeApprovedTransaction(txHash2);
    await account.executeApprovedTransaction(txHash3);
    const balanceAfter = await ethers.provider.getBalance(recipient.address);

    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("60")); // 10 + 20 + 30
  });

  it("Should track current level index independently per transaction", async () => {
    const txHash1 = await proposeTransaction(ethers.parseEther("50000"), ethers.parseEther("50"));
    const txHash2 = await proposeTransaction(ethers.parseEther("50000"), ethers.parseEther("100"));

    // Both start at Level 1
    expect(await account.currentLevelIndex(txHash1)).to.equal(0n);
    expect(await account.currentLevelIndex(txHash2)).to.equal(0n);

    // Progress Tx1 through Level 1
    await level1.connect(fixture.ops1).sign(txHash1);
    await level1.connect(fixture.ops2).sign(txHash1);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash1);

    // Tx1 should be at Level 2, Tx2 still at Level 1
    expect(await account.currentLevelIndex(txHash1)).to.equal(1n);
    expect(await account.currentLevelIndex(txHash2)).to.equal(0n);

    // Progress Tx2 through Level 1
    await level1.connect(fixture.ops1).sign(txHash2);
    await level1.connect(fixture.ops2).sign(txHash2);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    await level1.completeTimelock(txHash2);

    // Both should be at Level 2
    expect(await account.currentLevelIndex(txHash1)).to.equal(1n);
    expect(await account.currentLevelIndex(txHash2)).to.equal(1n);
  });
});

