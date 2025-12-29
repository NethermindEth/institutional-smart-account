import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MultiLevelAccount } from "../../typechain-types";
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("Amount Routing - Unit Tests", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let owner: SignerWithAddress;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    owner = fixture.owner;
  });

  describe("Amount Range Configuration", () => {
    it("Should route to single level for small amounts", async () => {
      const amount = ethers.parseEther("5000");
      const config = await account.getConfigForAmount(amount);

      expect(config.levelIds.length).to.equal(1);
      expect(config.levelIds[0]).to.equal(1n);
      expect(config.quorums[0]).to.equal(2n);
    });

    it("Should route to two levels for medium amounts", async () => {
      const amount = ethers.parseEther("50000");
      const config = await account.getConfigForAmount(amount);

      expect(config.levelIds.length).to.equal(2);
      expect(config.levelIds[0]).to.equal(1n);
      expect(config.levelIds[1]).to.equal(2n);
      expect(config.quorums[0]).to.equal(2n);
      expect(config.quorums[1]).to.equal(2n);
    });

    it("Should route to three levels for large amounts", async () => {
      const amount = ethers.parseEther("2000000");
      const config = await account.getConfigForAmount(amount);

      expect(config.levelIds.length).to.equal(3);
      expect(config.levelIds[0]).to.equal(1n);
      expect(config.levelIds[1]).to.equal(2n);
      expect(config.levelIds[2]).to.equal(3n);
      expect(config.quorums[0]).to.equal(3n);
      expect(config.quorums[1]).to.equal(2n);
      expect(config.quorums[2]).to.equal(1n);
    });

    it("Should handle exact boundary values", async () => {
      // Test minimum boundary
      const config1 = await account.getConfigForAmount(0);
      expect(config1.levelIds.length).to.equal(1);

      // Test maximum of first range
      const config2 = await account.getConfigForAmount(ethers.parseEther("10000"));
      expect(config2.levelIds.length).to.equal(1);

      // Test minimum of second range
      const config3 = await account.getConfigForAmount(ethers.parseEther("10001"));
      expect(config3.levelIds.length).to.equal(2);

      // Test maximum of second range
      const config4 = await account.getConfigForAmount(ethers.parseEther("1000000"));
      expect(config4.levelIds.length).to.equal(2);

      // Test minimum of third range
      const config5 = await account.getConfigForAmount(ethers.parseEther("1000001"));
      expect(config5.levelIds.length).to.equal(3);
    });

    it("Should handle maximum uint256 value", async () => {
      const maxAmount = ethers.MaxUint256;
      const config = await account.getConfigForAmount(maxAmount);

      expect(config.levelIds.length).to.equal(3);
    });
  });

  describe("Range Sorting", () => {
    it("Should maintain sorted order after adding ranges", async () => {
      // Add a range in the middle
      await account.connect(owner).configureAmountRange(
        ethers.parseEther("5000"),
        ethers.parseEther("7500"),
        [1],
        [2],
        [1800]
      );

      const count = await account.getAmountRangeCount();
      let prevMin = 0n;

      for (let i = 0; i < Number(count); i++) {
        const range = await account.getAmountRange(i);
        expect(range.minAmount).to.be.greaterThanOrEqual(prevMin);
        prevMin = range.minAmount;
      }
    });
  });

  describe("Quorum Configuration", () => {
    it("Should have correct quorum per level", async () => {
      const amount = ethers.parseEther("2000000");
      const config = await account.getConfigForAmount(amount);

      // Level 1: 3-of-3
      expect(config.quorums[0]).to.equal(3n);
      // Level 2: 2-of-2
      expect(config.quorums[1]).to.equal(2n);
      // Level 3: 1-of-1
      expect(config.quorums[2]).to.equal(1n);
    });
  });

  describe("Timelock Configuration", () => {
    it("Should have correct timelock per level", async () => {
      const amount = ethers.parseEther("2000000");
      const config = await account.getConfigForAmount(amount);

      // Level 1: 1 hour
      expect(config.timelocks[0]).to.equal(3600n);
      // Level 2: 2 hours
      expect(config.timelocks[1]).to.equal(7200n);
      // Level 3: 24 hours
      expect(config.timelocks[2]).to.equal(86400n);
    });
  });
});

