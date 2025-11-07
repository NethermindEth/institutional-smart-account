/**
 * EventMonitor Tests
 * 
 * Tests for transaction event monitoring
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccountSDK } from "../../sdk/src/MultiLevelAccountSDK";
import { deploySDKFixture, SDKFixture } from "./helpers/sdkFixtures";

describe("EventMonitor", () => {
  let fixture: SDKFixture;
  
  beforeEach(async () => {
    fixture = await deploySDKFixture();
    
    await fixture.owner.sendTransaction({
      to: await fixture.account.getAddress(),
      value: ethers.parseEther("100")
    });
  });
  
  describe("Status Monitoring", () => {
    it("Should track transaction through all levels", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("2000000"); // 3 levels
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Monitor status
      const statusUpdates: number[] = [];
      const unsubscribe = fixture.sdk.monitorTransaction(txHash, (status) => {
        statusUpdates.push(status.currentLevelIndex);
      });
      
      // Level 1
      await fixture.level1.connect(fixture.ops1).sign(txHash);
      await fixture.level1.connect(fixture.ops2).sign(txHash);
      await fixture.level1.connect(fixture.ops3).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await fixture.level1.completeTimelock(txHash);
      
      // Level 2
      await fixture.level2.connect(fixture.comp1).sign(txHash);
      await fixture.level2.connect(fixture.comp2).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [7201]);
      await ethers.provider.send("evm_mine", []);
      await fixture.level2.completeTimelock(txHash);
      
      // Level 3
      await fixture.level3.connect(fixture.exec).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine", []);
      await fixture.level3.completeTimelock(txHash);
      
      unsubscribe();
      
      // Should have tracked progression
      expect(statusUpdates.length).to.be.greaterThan(0);
    });
    
    it("Should detect denial events", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      let denied = false;
      const unsubscribe = fixture.sdk.monitorTransaction(txHash, (status) => {
        if (status.levelStatuses.some(ls => ls.denied)) {
          denied = true;
          unsubscribe();
        }
      });
      
      // Deny transaction
      await fixture.level1.connect(fixture.ops1).deny(txHash);
      
      await ethers.provider.send("evm_mine", []);
      
      unsubscribe();
      expect(denied).to.be.true;
    });
    
    it("Should get accurate level statuses", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("2000000");
      
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      let status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.levelStatuses.length).to.equal(3);
      expect(status.levelStatuses[0].submitted).to.be.true;
      expect(status.levelStatuses[1].submitted).to.be.false; // Not yet submitted
      
      // Sign level 1
      await fixture.level1.connect(fixture.ops1).sign(txHash);
      
      status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.levelStatuses[0].signaturesCollected).to.equal(1);
      expect(status.levelStatuses[0].signaturesRequired).to.equal(3);
    });
  });
});

