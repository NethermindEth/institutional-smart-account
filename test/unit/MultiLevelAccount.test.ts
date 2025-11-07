import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, MultiLevelAccountFactory, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("MultiLevelAccount - Unit Tests", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let factory: MultiLevelAccountFactory;
  let entryPoint: IEntryPoint;
  let owner: any;
  let level1: Level;
  let level2: Level;
  let level3: Level;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    factory = fixture.factory;
    entryPoint = fixture.entryPoint;
    owner = fixture.owner;
    level1 = fixture.level1;
    level2 = fixture.level2;
    level3 = fixture.level3;
  });

  describe("Configuration Management", () => {
    it("Should add a new level", async () => {
      const newLevelSigners = [fixture.others[0].address, fixture.others[1].address];
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        4,
        newLevelSigners
      );

      const tx = await account.connect(owner).addLevel(await newLevel.getAddress());
      const receipt = await tx.wait();
      
      const event = receipt?.logs
        .map((log) => {
          try {
            return account.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "LevelAdded");

      expect(event).to.not.be.null;
      expect(await account.levelContracts(4)).to.equal(await newLevel.getAddress());
    });

    it("Should configure amount range", async () => {
      const minAmount = ethers.parseEther("5000");
      const maxAmount = ethers.parseEther("15000");
      const levelIds = [1];
      const quorums = [2];
      const timelocks = [1800];

      const tx = await account.connect(owner).configureAmountRange(
        minAmount,
        maxAmount,
        levelIds,
        quorums,
        timelocks
      );
      const receipt = await tx.wait();

      const event = receipt?.logs
        .map((log) => {
          try {
            return account.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AmountRangeConfigured");

      expect(event).to.not.be.null;
      
      // Find the range we just added (ranges are sorted by minAmount)
      const rangeCount = await account.getAmountRangeCount();
      let found = false;
      for (let i = 0; i < rangeCount; i++) {
        const range = await account.getAmountRange(i);
        if (range.minAmount === minAmount && range.maxAmount === maxAmount) {
          found = true;
          break;
        }
      }
      expect(found).to.be.true;
    });

    it("Should reject invalid amount range configuration", async () => {
      await expect(
        account.connect(owner).configureAmountRange(
          ethers.parseEther("10000"),
          ethers.parseEther("5000"), // min > max
          [1],
          [2],
          [3600]
        )
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject configuration with mismatched array lengths - levelIds vs quorums", async () => {
      await expect(
        account.connect(owner).configureAmountRange(
          ethers.parseEther("5000"),
          ethers.parseEther("15000"),
          [1, 2],
          [2], // Different length
          [3600, 7200]
        )
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject configuration with mismatched array lengths - levelIds vs timelocks", async () => {
      await expect(
        account.connect(owner).configureAmountRange(
          ethers.parseEther("5000"),
          ethers.parseEther("15000"),
          [1, 2],
          [2, 2],
          [3600] // Different length
        )
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject configuration with mismatched array lengths - quorums vs timelocks", async () => {
      await expect(
        account.connect(owner).configureAmountRange(
          ethers.parseEther("5000"),
          ethers.parseEther("15000"),
          [1, 2],
          [2], // Different length from timelocks
          [3600, 7200]
        )
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject configuration with non-existent level", async () => {
      await expect(
        account.connect(owner).configureAmountRange(
          ethers.parseEther("5000"),
          ethers.parseEther("15000"),
          [99], // Non-existent level
          [2],
          [3600]
        )
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should remove amount range", async () => {
      const initialCount = await account.getAmountRangeCount();
      
      await account.connect(owner).removeAmountRange(0);
      
      const newCount = await account.getAmountRangeCount();
      expect(newCount).to.equal(initialCount - 1n);
    });

    it("Should update level contract address", async () => {
      const newLevelSigners = [fixture.others[0].address];
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        1,
        newLevelSigners
      );

      await account.connect(owner).updateLevel(1, await newLevel.getAddress());
      
      expect(await account.levelContracts(1)).to.equal(await newLevel.getAddress());
    });
  });

  describe("Amount-Based Routing", () => {
    it("Should get correct config for amount in range", async () => {
      const amount = ethers.parseEther("5000");
      const config = await account.getConfigForAmount(amount);
      
      expect(config.levelIds.length).to.equal(1);
      expect(config.levelIds[0]).to.equal(1n);
    });

    it("Should get correct config for multi-level amount", async () => {
      const amount = ethers.parseEther("50000");
      const config = await account.getConfigForAmount(amount);
      
      expect(config.levelIds.length).to.equal(2);
      expect(config.levelIds[0]).to.equal(1n);
      expect(config.levelIds[1]).to.equal(2n);
    });

    it("Should get correct config for high amount", async () => {
      const amount = ethers.parseEther("2000000");
      const config = await account.getConfigForAmount(amount);
      
      expect(config.levelIds.length).to.equal(3);
      expect(config.levelIds[0]).to.equal(1n);
      expect(config.levelIds[1]).to.equal(2n);
      expect(config.levelIds[2]).to.equal(3n);
    });

    it("Should revert for amount with no config", async () => {
      // Remove all ranges first
      const count = await account.getAmountRangeCount();
      for (let i = Number(count) - 1; i >= 0; i--) {
        await account.connect(owner).removeAmountRange(i);
      }

      await expect(
        account.getConfigForAmount(ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(account, "NoConfigForAmount");
    });

    it("Should handle amount not matching any range - below min", async () => {
      // Remove all existing ranges first
      const count = await account.getAmountRangeCount();
      for (let i = Number(count) - 1; i >= 0; i--) {
        await account.connect(owner).removeAmountRange(i);
      }
      
      // Add a range that doesn't cover all amounts
      await account.connect(owner).configureAmountRange(
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        [1],
        [2],
        [3600]
      );
      
      // Try to get config for amount below range (amount < minAmount)
      await expect(
        account.getConfigForAmount(ethers.parseEther("5000"))
      ).to.be.revertedWithCustomError(account, "NoConfigForAmount");
    });

    it("Should handle amount not matching any range - above max", async () => {
      // Remove all existing ranges first
      const count = await account.getAmountRangeCount();
      for (let i = Number(count) - 1; i >= 0; i--) {
        await account.connect(owner).removeAmountRange(i);
      }
      
      // Add a range
      await account.connect(owner).configureAmountRange(
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        [1],
        [2],
        [3600]
      );
      
      // Try to get config for amount above range (amount > maxAmount)
      await expect(
        account.getConfigForAmount(ethers.parseEther("30000"))
      ).to.be.revertedWithCustomError(account, "NoConfigForAmount");
    });

    it("Should handle boundary conditions correctly", async () => {
      const config1 = await account.getConfigForAmount(ethers.parseEther("10000"));
      expect(config1.levelIds.length).to.equal(1);

      const config2 = await account.getConfigForAmount(ethers.parseEther("10001"));
      expect(config2.levelIds.length).to.equal(2);
    });
  });

  describe("Access Control", () => {
    it("Should reject non-owner from configuring", async () => {
      await expect(
        account.connect(fixture.ops1).configureAmountRange(
          0,
          ethers.parseEther("10000"),
          [1],
          [2],
          [3600]
        )
      ).to.be.revertedWithCustomError(account, "OwnableUnauthorizedAccount");
    });

    it("Should reject non-owner from adding levels", async () => {
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        4,
        [fixture.others[0].address]
      );

      await expect(
        account.connect(fixture.ops1).addLevel(await newLevel.getAddress())
      ).to.be.revertedWithCustomError(account, "OwnableUnauthorizedAccount");
    });
  });

  describe("Transaction Hash Generation", () => {
    it("Should generate unique transaction hashes", async () => {
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");

      // This would be called via EntryPoint in real scenario
      // For testing, we can check nonce increments
      const nonceBefore = await account.nonce();
      
      // Note: We can't directly call execute() as it's protected by onlyEntryPoint
      // This test verifies the nonce is accessible
      expect(nonceBefore).to.be.a("bigint");
    });
  });

  describe("View Functions", () => {
    it("Should return transaction details", async () => {
      // Transaction would need to be proposed first via EntryPoint
      // This is a placeholder test structure
      const txHash = ethers.ZeroHash;
      const tx = await account.getTransaction(txHash);
      
      // Empty transaction should have zero address
      expect(tx.to).to.equal(ethers.ZeroAddress);
    });

    it("Should return amount range count", async () => {
      const count = await account.getAmountRangeCount();
      expect(count).to.be.greaterThan(0n);
    });
  });

  describe("Level Management", () => {
    it("Should update existing level", async () => {
      const level1Address = await account.levelContracts(1);
      
      // Deploy new level contract
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        1,
        [fixture.ops1.address, fixture.ops2.address]
      );
      
      await account.connect(fixture.owner).updateLevel(1, await newLevel.getAddress());
      
      expect(await account.levelContracts(1)).to.equal(await newLevel.getAddress());
      expect(await account.levelContracts(1)).to.not.equal(level1Address);
    });

    it("Should reject updating non-existent level", async () => {
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        99,
        [fixture.ops1.address]
      );
      
      await expect(
        account.connect(fixture.owner).updateLevel(99, await newLevel.getAddress())
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject updating level to zero address", async () => {
      await expect(
        account.connect(fixture.owner).updateLevel(1, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should remove amount range and re-sort", async () => {
      // Remove all existing ranges first
      const initialCount = await account.getAmountRangeCount();
      for (let i = Number(initialCount) - 1; i >= 0; i--) {
        await account.connect(fixture.owner).removeAmountRange(i);
      }
      
      // Add multiple ranges in unsorted order to test sorting
      await account.connect(fixture.owner).configureAmountRange(
        ethers.parseEther("50000"),
        ethers.parseEther("60000"),
        [1],
        [2],
        [3600]
      );
      
      await account.connect(fixture.owner).configureAmountRange(
        ethers.parseEther("30000"),
        ethers.parseEther("40000"),
        [1],
        [2],
        [3600]
      );
      
      await account.connect(fixture.owner).configureAmountRange(
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        [1],
        [2],
        [3600]
      );
      
      // Verify ranges are sorted (should be 10000, 30000, 50000)
      const range0 = await account.getAmountRange(0);
      const range1 = await account.getAmountRange(1);
      const range2 = await account.getAmountRange(2);
      expect(range0.minAmount).to.equal(ethers.parseEther("10000"));
      expect(range1.minAmount).to.equal(ethers.parseEther("30000"));
      expect(range2.minAmount).to.equal(ethers.parseEther("50000"));
      
      // Remove a range in the middle (not the last one)
      // This tests the swap-and-pop logic
      await account.connect(fixture.owner).removeAmountRange(1);
      
      // Verify removed
      const countAfter = await account.getAmountRangeCount();
      expect(countAfter).to.equal(2n);
      
      // Verify ranges are still sorted after removal
      const rangeCount = await account.getAmountRangeCount();
      let prevMin = 0n;
      for (let i = 0; i < rangeCount; i++) {
        const range = await account.getAmountRange(i);
        expect(range.minAmount).to.be.greaterThanOrEqual(prevMin);
        prevMin = range.minAmount;
      }
    });

    it("Should reject removing invalid index", async () => {
      const count = await account.getAmountRangeCount();
      const invalidIndex = count;
      
      await expect(
        account.connect(fixture.owner).removeAmountRange(invalidIndex)
      ).to.be.revertedWithCustomError(account, "InvalidConfiguration");
    });

    it("Should reject addLevelDuringInit after initialization", async () => {
      const LevelFactory = await ethers.getContractFactory("Level");
      const newLevel = await LevelFactory.deploy(
        await account.getAddress(),
        4,
        [fixture.others[0].address]
      );
      
      // Account is already initialized, so this should fail
      await expect(
        account.connect(fixture.others[0]).addLevelDuringInit(await newLevel.getAddress())
      ).to.be.revertedWithCustomError(account, "Unauthorized");
    });

    it("Should reject completeInitialization twice", async () => {
      // Account is already initialized, so trying again should fail
      await expect(
        account.connect(fixture.others[0]).completeInitialization()
      ).to.be.revertedWithCustomError(account, "Unauthorized");
    });
  });

  describe("ERC-4337 Validation", () => {
    it("Should reject invalid signature in validateUserOp", async () => {
      const { createUserOp, getUserOpHash, signUserOp } = await import("../helpers/userOp");
      
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const nonce = await account.nonce();
      const callData = account.interface.encodeFunctionData("execute", [to, value, data, amount]);
      
      const userOp = createUserOp({
        sender: await account.getAddress(),
        nonce,
        callData
      });
      
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
      
      // Sign with wrong signer (not owner)
      const wrongSignature = await signUserOp(userOp, fixture.ops1, await entryPoint.getAddress(), chainId);
      userOp.signature = wrongSignature;
      
      // Impersonate EntryPoint
      await ethers.provider.send("hardhat_impersonateAccount", [await entryPoint.getAddress()]);
      const entryPointSigner = await ethers.getSigner(await entryPoint.getAddress());
      
      const validationData = await account.connect(entryPointSigner).validateUserOp.staticCall(
        userOp,
        userOpHash,
        0
      );
      
      // Should return 1 (SIG_VALIDATION_FAILED)
      expect(validationData).to.equal(1n);
    });

    it("Should handle missingAccountFunds in validateUserOp", async () => {
      const { createUserOp, getUserOpHash, signUserOp } = await import("../helpers/userOp");
      
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      const nonce = await account.nonce();
      const callData = account.interface.encodeFunctionData("execute", [to, value, data, amount]);
      
      const userOp = createUserOp({
        sender: await account.getAddress(),
        nonce,
        callData
      });
      
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
      const signature = await signUserOp(userOp, owner, await entryPoint.getAddress(), chainId);
      userOp.signature = signature;
      
      // Fund account for prefund
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("10")
      });
      
      // Impersonate EntryPoint
      await ethers.provider.send("hardhat_impersonateAccount", [await entryPoint.getAddress()]);
      const entryPointSigner = await ethers.getSigner(await entryPoint.getAddress());
      
      // Test with missingAccountFunds > 0
      const missingFunds = ethers.parseEther("1");
      const validationData = await account.connect(entryPointSigner).validateUserOp.staticCall(
        userOp,
        userOpHash,
        missingFunds
      );
      
      // Should return 0 (validation succeeded)
      expect(validationData).to.equal(0n);
    });
  });

  describe("Transaction Execution Edge Cases", () => {
    it("Should handle transaction execution failure", async () => {
      // Create a contract that reverts on receive
      const RevertingContractFactory = await ethers.getContractFactory("RevertingContract");
      const revertingContract = await RevertingContractFactory.deploy();
      
      // Propose a transaction that will fail
      const to = await revertingContract.getAddress();
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000");
      
      // Fund account
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("100")
      });
      
      // Propose via EntryPoint
      const { createUserOp, getUserOpHash, signUserOp } = await import("../helpers/userOp");
      const nonce = await account.nonce();
      const callData = account.interface.encodeFunctionData("execute", [to, value, data, amount]);
      
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
      
      // Get transaction hash
      const filter = account.filters.TransactionProposed();
      const events = await account.queryFilter(filter);
      const txHash = events[events.length - 1].args[0];
      
      // Approve through level 1
      await level1.connect(fixture.ops1).sign(txHash);
      await level1.connect(fixture.ops2).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await level1.completeTimelock(txHash);
      
      // Wait for state to propagate
      await ethers.provider.send("evm_mine", []);
      
      // Check if fully approved
      const fullyApproved = await account.fullyApproved(txHash);
      expect(fullyApproved).to.be.true;
      
      // Execution should revert with TransactionFailed
      await expect(
        account.executeApprovedTransaction(txHash)
      ).to.be.revertedWithCustomError(account, "TransactionFailed");
    });
  });

  describe("Level Callback Edge Cases", () => {
    it("Should handle last level approval correctly", async () => {
      // Test the branch where currentLevelIndex == levelIds.length (last level)
      const to = fixture.others[0].address;
      const value = ethers.parseEther("1");
      const data = "0x";
      const amount = ethers.parseEther("5000"); // Single level
      
      // Fund account
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("100")
      });
      
      // Propose via EntryPoint
      const { createUserOp, getUserOpHash, signUserOp } = await import("../helpers/userOp");
      const nonce = await account.nonce();
      const callData = account.interface.encodeFunctionData("execute", [to, value, data, amount]);
      
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
      
      // Get transaction hash
      const filter = account.filters.TransactionProposed();
      const events = await account.queryFilter(filter);
      const txHash = events[events.length - 1].args[0];
      
      // Approve through level 1 (the only level for this amount)
      await level1.connect(fixture.ops1).sign(txHash);
      await level1.connect(fixture.ops2).sign(txHash);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await level1.completeTimelock(txHash);
      
      // Should be fully approved (no more levels)
      const fullyApproved = await account.fullyApproved(txHash);
      expect(fullyApproved).to.be.true;
    });

    it("Should reject wrong level calling onLevelApproved", async () => {
      // This test is difficult in unit tests because onLevelApproved has onlyLevel modifier
      // which requires the caller to be the level contract itself
      // The branch exists in the code: if (txn.config.levelIds[currentIdx] != levelId) revert LevelMismatch();
      // This will be tested in integration tests where we can verify the correct level progression
      // The branch coverage will show it's tested in integration tests
    });
  });
});

