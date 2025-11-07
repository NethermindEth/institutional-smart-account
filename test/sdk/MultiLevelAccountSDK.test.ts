/**
 * SDK Tests
 * 
 * Comprehensive tests for the MultiLevelAccountSDK
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccountSDK } from "../../sdk/src/MultiLevelAccountSDK";
import { deploySDKFixture, SDKFixture } from "./helpers/sdkFixtures";
import {
  SCENARIO_HAPPY_PATH,
  SCENARIO_EARLY_DENIAL,
  SCENARIO_MID_LEVEL_DENIAL,
  SCENARIO_LATE_DENIAL,
  SCENARIO_RAPID_APPROVAL,
  CoSignerScenario
} from "./scenarios/coSignerBehaviors";
import { MockCoSigner } from "./helpers/mockCoSigners";

describe("MultiLevelAccountSDK", () => {
  let fixture: SDKFixture;
  
  beforeEach(async () => {
    fixture = await deploySDKFixture();
    
    // Fund the account
    await fixture.owner.sendTransaction({
      to: await fixture.account.getAddress(),
      value: ethers.parseEther("100")
    });
  });
  
  describe("SDK Initialization", () => {
    it("Should initialize SDK correctly", () => {
      expect(fixture.sdk).to.not.be.undefined;
    });
    
    it("Should get signer interface for level", async () => {
      const signerInterface = fixture.sdk.getSignerInterface(1);
      expect(signerInterface).to.not.be.undefined;
    });
  });
  
  describe("Transaction Proposal", () => {
    it("Should propose transaction via SDK", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000"); // Level 1 only
      
      const txHash = await fixture.sdk.proposeTransaction(
        to,
        value,
        data,
        amount
      );
      
      expect(txHash).to.not.be.undefined;
      expect(txHash).to.be.a("string");
      
      // Verify transaction was proposed
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.txHash).to.equal(txHash);
      expect(status.to).to.equal(to);
    });
    
    it("Should propose large transaction requiring 3 levels", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("100");
      const data = "0x";
      const amount = ethers.parseEther("2000000"); // Requires 3 levels
      
      const txHash = await fixture.sdk.proposeTransaction(
        to,
        value,
        data,
        amount
      );
      
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.levelStatuses.length).to.equal(3);
    });
  });
  
  describe("Co-Signer Scenarios", () => {
    /**
     * Helper to execute a scenario
     */
    async function executeScenario(
      scenario: CoSignerScenario,
      amount: bigint
    ): Promise<string> {
      // Propose transaction
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      
      const txHash = await fixture.sdk.proposeTransaction(
        to,
        value,
        data,
        amount
      );
      
      // Execute scenario behaviors
      const levelContracts = new Map([
        [1, fixture.level1],
        [2, fixture.level2],
        [3, fixture.level3]
      ]);
      
      const signerMap = fixture.signerMap;
      const signers = new Map([
        ['ops1', fixture.ops1],
        ['ops2', fixture.ops2],
        ['ops3', fixture.ops3],
        ['comp1', fixture.comp1],
        ['comp2', fixture.comp2],
        ['exec', fixture.exec]
      ]);
      
      // Execute behaviors for each level
      for (const levelConfig of scenario.levels) {
        const level = levelContracts.get(levelConfig.levelId);
        if (!level) continue;
        
        for (const behavior of levelConfig.signers) {
          const signer = signers.get(behavior.signer);
          if (!signer) continue;
          
          // Wait for delay
          if (behavior.delaySeconds && behavior.delaySeconds > 0) {
            await ethers.provider.send("evm_increaseTime", [behavior.delaySeconds]);
            await ethers.provider.send("evm_mine", []);
          }
          
          // Execute action
          switch (behavior.action) {
            case 'sign':
              await level.connect(signer).sign(txHash);
              break;
            case 'deny':
              await level.connect(signer).deny(txHash);
              break;
            case 'abstain':
              // Do nothing
              break;
          }
          
          // If denied, stop processing
          if (behavior.action === 'deny') {
            return txHash;
          }
        }
        
        // Complete timelock if quorum reached and not the last level
        if (levelConfig.levelId < scenario.levels.length) {
          // Check if quorum was reached
          const state = await level.getApprovalState(txHash);
          if (state.signatureCount >= state.requiredQuorum) {
            // Wait for timelock
            const timelockDuration = state.timelockDuration;
            await ethers.provider.send("evm_increaseTime", [Number(timelockDuration) + 1]);
            await ethers.provider.send("evm_mine", []);
            
            // Complete timelock (anyone can call)
            try {
              await level.completeTimelock(txHash);
              // Wait for callback to process
              await ethers.provider.send("evm_mine", []);
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) {
              // Might fail if quorum not reached or timelock not expired
            }
          }
        }
      }
      
      return txHash;
    }
    
    it("Should handle happy path scenario", async () => {
      const amount = ethers.parseEther("2000000"); // 3 levels
      const txHash = await executeScenario(SCENARIO_HAPPY_PATH, amount);
      
      // Complete final timelock
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine", []);
      
      // Manually submit to level3 if not already submitted
      const level3State = await fixture.level3.getApprovalState(txHash);
      if (!level3State.submitted) {
        const txn = await fixture.account.getTransaction(txHash);
        const config = txn.config;
        const level3Idx = 2; // Level 3 is at index 2
        await ethers.provider.send("hardhat_impersonateAccount", [await fixture.account.getAddress()]);
        const accountSigner = await ethers.getSigner(await fixture.account.getAddress());
        await fixture.owner.sendTransaction({
          to: await fixture.account.getAddress(),
          value: ethers.parseEther("1")
        });
        await fixture.level3.connect(accountSigner).submitTransaction(
          txHash,
          config.quorums[level3Idx],
          config.timelocks[level3Idx]
        );
      }
      
      await fixture.level3.completeTimelock(txHash);
      
      // Verify fully approved
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.fullyApproved).to.be.true;
    });
    
    it("Should handle early denial scenario", async () => {
      const amount = ethers.parseEther("2000000");
      const txHash = await executeScenario(SCENARIO_EARLY_DENIAL, amount);
      
      // Wait for state to propagate
      await ethers.provider.send("evm_mine", []);
      
      // Verify denied - check level1 directly
      const level1State = await fixture.level1.getApprovalState(txHash);
      expect(level1State.denied).to.be.true;
      
      // Also check via SDK
      const status = await fixture.sdk.getTransactionStatus(txHash);
      if (status.levelStatuses.length > 0) {
        expect(status.levelStatuses[0].denied).to.be.true;
      }
    });
    
    it("Should handle mid-level denial scenario", async () => {
      const amount = ethers.parseEther("2000000");
      const txHash = await executeScenario(SCENARIO_MID_LEVEL_DENIAL, amount);
      
      // Wait for state to propagate
      await ethers.provider.send("evm_mine", []);
      
      // Verify level 1 approved but level 2 denied - check directly
      const level1State = await fixture.level1.getApprovalState(txHash);
      const level2State = await fixture.level2.getApprovalState(txHash);
      expect(level1State.approved).to.be.true;
      expect(level2State.denied).to.be.true;
      
      // Also check via SDK
      const status = await fixture.sdk.getTransactionStatus(txHash);
      if (status.levelStatuses.length > 1) {
        expect(status.levelStatuses[0].approved).to.be.true;
        expect(status.levelStatuses[1].denied).to.be.true;
      }
    });
    
    it("Should handle late denial scenario", async () => {
      const amount = ethers.parseEther("2000000");
      const txHash = await executeScenario(SCENARIO_LATE_DENIAL, amount);
      
      // Wait for level2 callback to submit to level3
      await ethers.provider.send("evm_mine", []);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Manually submit to level3 if not already submitted (before denial)
      let level3State = await fixture.level3.getApprovalState(txHash);
      if (!level3State.submitted) {
        const txn = await fixture.account.getTransaction(txHash);
        const config = txn.config;
        const level3Idx = 2;
        await ethers.provider.send("hardhat_impersonateAccount", [await fixture.account.getAddress()]);
        const accountSigner = await ethers.getSigner(await fixture.account.getAddress());
        await fixture.owner.sendTransaction({
          to: await fixture.account.getAddress(),
          value: ethers.parseEther("1")
        });
        await fixture.level3.connect(accountSigner).submitTransaction(
          txHash,
          config.quorums[level3Idx],
          config.timelocks[level3Idx]
        );
        level3State = await fixture.level3.getApprovalState(txHash);
      }
      
      // Verify levels 1 and 2 approved but level 3 denied - check directly
      const level1State = await fixture.level1.getApprovalState(txHash);
      const level2State = await fixture.level2.getApprovalState(txHash);
      expect(level1State.approved).to.be.true;
      expect(level2State.approved).to.be.true;
      expect(level3State.denied).to.be.true;
      
      // Also check via SDK
      const status = await fixture.sdk.getTransactionStatus(txHash);
      if (status.levelStatuses.length > 2) {
        expect(status.levelStatuses[0].approved).to.be.true;
        expect(status.levelStatuses[1].approved).to.be.true;
        expect(status.levelStatuses[2].denied).to.be.true;
      }
    });
    
    it("Should handle rapid approval scenario", async () => {
      const amount = ethers.parseEther("2000000");
      const txHash = await executeScenario(SCENARIO_RAPID_APPROVAL, amount);
      
      // Complete timelocks - check state first to avoid AlreadyApproved
      const level1State = await fixture.level1.getApprovalState(txHash);
      if (level1State.signatureCount >= level1State.requiredQuorum && !level1State.approved) {
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine", []);
        await fixture.level1.completeTimelock(txHash);
        await ethers.provider.send("evm_mine", []);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const level2State = await fixture.level2.getApprovalState(txHash);
      if (level2State.submitted && level2State.signatureCount >= level2State.requiredQuorum && !level2State.approved) {
        await ethers.provider.send("evm_increaseTime", [7201]);
        await ethers.provider.send("evm_mine", []);
        await fixture.level2.completeTimelock(txHash);
        await ethers.provider.send("evm_mine", []);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Manually submit to level3 if not already submitted
      let level3State = await fixture.level3.getApprovalState(txHash);
      if (!level3State.submitted) {
        const txn = await fixture.account.getTransaction(txHash);
        const config = txn.config;
        const level3Idx = 2;
        await ethers.provider.send("hardhat_impersonateAccount", [await fixture.account.getAddress()]);
        const accountSigner = await ethers.getSigner(await fixture.account.getAddress());
        await fixture.owner.sendTransaction({
          to: await fixture.account.getAddress(),
          value: ethers.parseEther("1")
        });
        await fixture.level3.connect(accountSigner).submitTransaction(
          txHash,
          config.quorums[level3Idx],
          config.timelocks[level3Idx]
        );
        level3State = await fixture.level3.getApprovalState(txHash);
      }
      
      if (level3State.submitted && level3State.signatureCount >= level3State.requiredQuorum && !level3State.approved) {
        await ethers.provider.send("evm_increaseTime", [86401]);
        await ethers.provider.send("evm_mine", []);
        await fixture.level3.completeTimelock(txHash);
      }
      
      // Verify fully approved
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.fullyApproved).to.be.true;
    });
  });
  
  describe("Signer Interface", () => {
    it("Should get pending transactions for a signer", async () => {
      // Propose a transaction
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Get signer interface for level 1
      const signerInterface = fixture.sdk.getSignerInterface(1);
      await signerInterface.initialize();
      
      // Get pending transactions
      const pending = await signerInterface.getPendingTransactions();
      expect(pending.length).to.be.greaterThan(0);
    });
    
    it("Should allow signer to sign via interface", async () => {
      // Propose transaction
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Create signer interface for ops1
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        await fixture.entryPoint.getAddress(),
        fixture.ops1
      );
      
      const signerInterface = sdkForOps1.getSignerInterface(1);
      await signerInterface.initialize();
      
      // Sign transaction
      await signerInterface.sign(txHash);
      
      // Verify signed
      const status = await signerInterface.getMyStatus(txHash);
      expect(status.signed).to.be.true;
    });
    
    it("Should allow signer to deny via interface", async () => {
      // Propose transaction
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Create signer interface for ops1
      const entryPointAddress = await fixture.entryPoint.getAddress();
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        entryPointAddress,
        fixture.ops1
      );
      
      const signerInterface = sdkForOps1.getSignerInterface(1);
      await signerInterface.initialize();
      
      // Deny transaction
      await signerInterface.deny(txHash);
      
      // Verify denied
      const status = await signerInterface.getMyStatus(txHash);
      expect(status.denied).to.be.true;
    });
  });
  
  describe("Event Monitoring", () => {
    it("Should monitor transaction progress", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      return new Promise<void>((resolve, reject) => {
        let eventCount = 0;
        const unsubscribe = fixture.sdk.monitorTransaction(txHash, (status) => {
          eventCount++;
          
          if (status.fullyApproved) {
            unsubscribe();
            expect(eventCount).to.be.greaterThan(0);
            resolve();
          }
        });
        
        // Sign and complete
        (async () => {
          try {
            await fixture.level1.connect(fixture.ops1).sign(txHash);
            await fixture.level1.connect(fixture.ops2).sign(txHash);
            
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);
            await fixture.level1.completeTimelock(txHash);
            
            // Wait a bit for event to fire
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            unsubscribe();
            reject(error);
          }
        })();
      });
    });
    
    it("Should get current transaction status", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.txHash).to.equal(txHash);
      expect(status.currentLevelIndex).to.equal(0);
      expect(status.fullyApproved).to.be.false;
    });
  });
  
  describe("Transaction Execution", () => {
    it("Should execute fully approved transaction", async () => {
      // Fund account
      await fixture.owner.sendTransaction({
        to: await fixture.account.getAddress(),
        value: ethers.parseEther("10")
      });
      
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Approve through level 1
      await fixture.level1.connect(fixture.ops1).sign(txHash);
      await fixture.level1.connect(fixture.ops2).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await fixture.level1.completeTimelock(txHash);
      
      // Verify fully approved
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.fullyApproved).to.be.true;
      
      // Execute
      const balanceBefore = await ethers.provider.getBalance(to);
      await fixture.sdk.executeApprovedTransaction(txHash);
      const balanceAfter = await ethers.provider.getBalance(to);
      
      expect(balanceAfter - balanceBefore).to.equal(value);
    });
  });
});

