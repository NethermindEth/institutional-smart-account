/**
 * UserOpBuilder Tests
 * 
 * Tests for UserOperation building and signing
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccountSDK } from "../../sdk/src/MultiLevelAccountSDK";
import { deploySDKFixture, SDKFixture } from "./helpers/sdkFixtures";

describe("UserOpBuilder", () => {
  let fixture: SDKFixture;
  
  beforeEach(async () => {
    fixture = await deploySDKFixture();
    
    await fixture.owner.sendTransaction({
      to: await fixture.account.getAddress(),
      value: ethers.parseEther("100")
    });
  });
  
  describe("UserOp Construction", () => {
    it("Should build valid UserOp", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      // Access UserOpBuilder through SDK
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // Verify transaction was created
      expect(txHash).to.not.be.undefined;
      
      const status = await fixture.sdk.getTransactionStatus(txHash);
      expect(status.txHash).to.equal(txHash);
    });
    
    it("Should include correct nonce", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const nonceBefore = await fixture.account.nonce();
      
      await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      const nonceAfter = await fixture.account.nonce();
      expect(nonceAfter).to.equal(nonceBefore + 1n);
    });
    
    it("Should handle multiple UserOps with incrementing nonces", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const txHash1 = await fixture.sdk.proposeTransaction(to, value, data, amount);
      const txHash2 = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      expect(txHash1).to.not.equal(txHash2);
      
      const nonce = await fixture.account.nonce();
      expect(nonce).to.equal(2n);
    });
  });
  
  describe("UserOp Signing", () => {
    it("Should sign UserOp correctly", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      // Propose transaction (which signs the UserOp)
      const txHash = await fixture.sdk.proposeTransaction(to, value, data, amount);
      
      // If we got here, the UserOp was signed and executed
      expect(txHash).to.not.be.undefined;
    });
  });
});

