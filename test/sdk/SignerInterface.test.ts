/**
 * SignerInterface Tests
 * 
 * Tests for the privacy-preserving signer interface
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccountSDK } from "../../sdk/src/MultiLevelAccountSDK";
import { deploySDKFixture, SDKFixture } from "./helpers/sdkFixtures";

describe("SignerInterface", () => {
  let fixture: SDKFixture;
  
  beforeEach(async () => {
    fixture = await deploySDKFixture();
    
    await fixture.owner.sendTransaction({
      to: await fixture.account.getAddress(),
      value: ethers.parseEther("100")
    });
  });
  
  describe("Privacy-Preserving Interface", () => {
    it("Should only show transactions for signer's level", async () => {
      // Propose transaction requiring 3 levels
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("2000000");
      
      await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Level 1 signer should only see level 1 transactions
      const entryPointAddress = await fixture.entryPoint.getAddress();
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        entryPointAddress,
        fixture.ops1
      );
      
      const level1Interface = sdkForOps1.getSignerInterface(1);
      await level1Interface.initialize();
      
      const pending = await level1Interface.getPendingTransactions();
      expect(pending.length).to.be.greaterThan(0);
      
      // Level 2 signer should not see level 1 transactions yet
      const sdkForComp1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        entryPointAddress,
        fixture.comp1
      );
      
      const level2Interface = sdkForComp1.getSignerInterface(2);
      await level2Interface.initialize();
      
      const pendingLevel2 = await level2Interface.getPendingTransactions();
      // Should be empty until level 1 approves
      expect(pendingLevel2.length).to.equal(0);
    });
    
    it("Should show transactions after level progression", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("2000000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Level 1 approves
      await fixture.level1.connect(fixture.ops1).sign(txHash);
      await fixture.level1.connect(fixture.ops2).sign(txHash);
      await fixture.level1.connect(fixture.ops3).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await fixture.level1.completeTimelock(txHash);
      
      // Now level 2 should see the transaction
      const entryPointAddress = await fixture.entryPoint.getAddress();
      const sdkForComp1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        entryPointAddress,
        fixture.comp1
      );
      
      const level2Interface = sdkForComp1.getSignerInterface(2);
      await level2Interface.initialize();
      
      // Wait a moment for state to propagate
      await ethers.provider.send("evm_mine", []);
      
      const pendingLevel2 = await level2Interface.getPendingTransactions();
      expect(pendingLevel2.length).to.be.greaterThan(0);
    });
  });
  
  describe("Co-Signer Information", () => {
    it("Should get co-signers at a level", async () => {
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        await fixture.entryPoint.getAddress(),
        fixture.ops1
      );
      
      const level1Interface = sdkForOps1.getSignerInterface(1);
      await level1Interface.initialize();
      
      const coSigners = await level1Interface.getCoSigners();
      expect(coSigners.length).to.equal(3);
      expect(coSigners).to.include(fixture.ops1.address);
      expect(coSigners).to.include(fixture.ops2.address);
      expect(coSigners).to.include(fixture.ops3.address);
    });
    
    it("Should get my signing status", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        await fixture.entryPoint.getAddress(),
        fixture.ops1
      );
      
      const level1Interface = sdkForOps1.getSignerInterface(1);
      await level1Interface.initialize();
      
      // Initially not signed
      let status = await level1Interface.getMyStatus(txHash);
      expect(status.signed).to.be.false;
      expect(status.denied).to.be.false;
      
      // Sign
      await level1Interface.sign(txHash);
      
      // Now signed
      status = await level1Interface.getMyStatus(txHash);
      expect(status.signed).to.be.true;
    });
  });
  
  describe("Event Subscriptions", () => {
    it("Should subscribe to new transactions", async () => {
      const entryPointAddress = await fixture.entryPoint.getAddress();
      const sdkForOps1 = new MultiLevelAccountSDK(
        await fixture.account.getAddress(),
        entryPointAddress,
        fixture.ops1
      );
      
      const level1Interface = sdkForOps1.getSignerInterface(1);
      await level1Interface.initialize();
      
      return new Promise<void>((resolve, reject) => {
        let receivedTxHash: string | null = null;
        
        const unsubscribe = level1Interface.onNewTransaction((txHash) => {
          receivedTxHash = txHash;
          unsubscribe();
          expect(receivedTxHash).to.not.be.null;
          resolve();
        });
        
        // Propose transaction
        (async () => {
          try {
            const to = fixture.others[0].address;
            const value = ethers.parseEther("1");
            const data = "0x";
            const amount = ethers.parseEther("5000");
            
            await fixture.sdk.proposeTransaction(to, value, data, amount);
            
            // Wait a bit for event to fire
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            unsubscribe();
            reject(error);
          }
        })();
      });
    });
  });
});

