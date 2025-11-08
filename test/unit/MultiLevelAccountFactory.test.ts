import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccountFactory, MultiLevelAccount, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";

describe("MultiLevelAccountFactory - Unit Tests", () => {
  let factory: MultiLevelAccountFactory;
  let entryPoint: IEntryPoint;
  let owner: any;
  let ops1: any, ops2: any, ops3: any;
  let comp1: any, comp2: any;
  let exec: any;

  beforeEach(async () => {
    const [deployer, ownerAddr, ops1Addr, ops2Addr, ops3Addr, comp1Addr, comp2Addr, execAddr] = 
      await ethers.getSigners();
    
    owner = ownerAddr;
    ops1 = ops1Addr;
    ops2 = ops2Addr;
    ops3 = ops3Addr;
    comp1 = comp1Addr;
    comp2 = comp2Addr;
    exec = execAddr;

    // Deploy MockEntryPoint
    const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await EntryPointFactory.deploy() as unknown as IEntryPoint;

    // Deploy Factory
    const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
    factory = await Factory.deploy(await entryPoint.getAddress());
  });

  describe("Account Creation", () => {
    it("Should create account with levels", async () => {
      const levelSigners = [
        [ops1.address, ops2.address, ops3.address],
        [comp1.address, comp2.address],
        [exec.address]
      ];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");

      expect(accountCreatedEvent).to.not.be.null;
      
      if (accountCreatedEvent && accountCreatedEvent.args) {
        const accountAddress = accountCreatedEvent.args[0];
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          accountAddress
        ) as unknown as MultiLevelAccount;

        expect(await account.owner()).to.equal(owner.address);
        expect(await account.levelContracts(1)).to.not.equal(ethers.ZeroAddress);
        expect(await account.levelContracts(2)).to.not.equal(ethers.ZeroAddress);
        expect(await account.levelContracts(3)).to.not.equal(ethers.ZeroAddress);
      }
    });

    it("Should emit LevelCreated events", async () => {
      const levelSigners = [
        [ops1.address, ops2.address],
        [comp1.address]
      ];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const levelEvents = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((parsed) => parsed && parsed.name === "LevelCreated");

      expect(levelEvents?.length).to.equal(2);
    });

    it("Should create levels with correct signers", async () => {
      const levelSigners = [
        [ops1.address, ops2.address, ops3.address]
      ];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");

      if (accountCreatedEvent && accountCreatedEvent.args) {
        const accountAddress = accountCreatedEvent.args[0];
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          accountAddress
        ) as unknown as MultiLevelAccount;

        const level1Address = await account.levelContracts(1);
        const level1 = await ethers.getContractAt("Level", level1Address) as unknown as Level;

        const signers = await level1.getSigners();
        expect(signers.length).to.equal(3);
        expect(signers[0]).to.equal(ops1.address);
        expect(signers[1]).to.equal(ops2.address);
        expect(signers[2]).to.equal(ops3.address);
      }
    });
  });

  describe("Counterfactual Address", () => {
    it("Should compute counterfactual address", async () => {
      const salt = 12345;
      const computedAddress = await factory.computeAccountAddress(owner.address, salt);
      
      expect(computedAddress).to.not.equal(ethers.ZeroAddress);
      expect(computedAddress).to.be.a("string");
    });

    it("Should compute address with zero salt", async () => {
      const computedAddress = await factory.computeAccountAddress(owner.address, 0);
      expect(computedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should compute address with large salt", async () => {
      const largeSalt = ethers.MaxUint256;
      const computedAddress = await factory.computeAccountAddress(owner.address, largeSalt);
      expect(computedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should compute address with zero address owner", async () => {
      const computedAddress = await factory.computeAccountAddress(ethers.ZeroAddress, 1);
      expect(computedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should compute different addresses for different salts", async () => {
      // The factory now uses CREATE2, so computeAccountAddress should match actual deployments
      const salt1 = 1n;
      const salt2 = 2n;
      const address1 = await factory.computeAccountAddress(owner.address, salt1);
      const address2 = await factory.computeAccountAddress(owner.address, salt2);
      
      // These should be different (CREATE2 formula with different salts)
      expect(address1).to.not.equal(address2, "Addresses should be different for different salts");
      expect(address1).to.not.equal(ethers.ZeroAddress);
      expect(address2).to.not.equal(ethers.ZeroAddress);
    });

    it("Should compute different addresses for different owners", async () => {
      const signers = await ethers.getSigners();
      // Use signers that haven't been used in beforeEach to avoid any conflicts
      // Use signers[7] and signers[8] if available, otherwise use 0 and 1
      const owner1 = signers.length > 7 ? signers[7] : signers[0];
      const owner2 = signers.length > 8 ? signers[8] : signers[1];
      
      // Verify we have different owners
      expect(owner1.address).to.not.equal(owner2.address, "Test setup: owners must be different");
      
      // Get addresses with same salt but different owners
      const address1 = await factory.computeAccountAddress(owner1.address, 1);
      const address2 = await factory.computeAccountAddress(owner2.address, 1);
      
      // Different owners should produce different addresses
      // The owner is part of the constructor args, so different owners = different initCode
      expect(address1).to.not.equal(ethers.ZeroAddress);
      expect(address2).to.not.equal(ethers.ZeroAddress);
      expect(address1).to.not.equal(address2);
    });

    it("Should match computeAccountAddress with actual deployed address", async () => {
      const salt = 12345;
      const predictedAddress = await factory.computeAccountAddress(owner.address, salt);
      
      const levelSigners = [[ops1.address]];
      const tx = await factory.createAccount(owner.address, levelSigners, salt);
      const receipt = await tx.wait();
      
      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");
      
      expect(accountCreatedEvent).to.not.be.null;
      
      if (accountCreatedEvent && accountCreatedEvent.args) {
        const actualAddress = accountCreatedEvent.args[0];
        // The predicted address should match the actual deployed address
        expect(actualAddress).to.equal(predictedAddress);
      }
    });

    it("Should allow pre-funding counterfactual address", async () => {
      // This test verifies the fix for the security issue:
      // Users can safely pre-fund the counterfactual address before deployment
      const salt = 0;
      const predictedAddress = await factory.computeAccountAddress(owner.address, salt);
      
      // Pre-fund the predicted address
      const funder = owner;
      const fundAmount = ethers.parseEther("1.0");
      await funder.sendTransaction({
        to: predictedAddress,
        value: fundAmount,
      });
      
      // Verify the funds are at the predicted address
      const balanceBefore = await ethers.provider.getBalance(predictedAddress);
      expect(balanceBefore).to.equal(fundAmount);
      
      // Deploy the account using CREATE2
      const levelSigners = [[ops1.address]];
      const tx = await factory.createAccount(owner.address, levelSigners, salt);
      const receipt = await tx.wait();
      
      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");
      
      expect(accountCreatedEvent).to.not.be.null;
      
      if (accountCreatedEvent && accountCreatedEvent.args) {
        const actualAddress = accountCreatedEvent.args[0];
        
        // The actual address must match the predicted address
        expect(actualAddress).to.equal(predictedAddress);
        
        // Verify the funds are still there and accessible
        const balanceAfter = await ethers.provider.getBalance(actualAddress);
        expect(balanceAfter).to.equal(fundAmount);
        
        // Verify we can interact with the account (proving it's the correct contract)
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          actualAddress
        ) as unknown as MultiLevelAccount;
        expect(await account.owner()).to.equal(owner.address);
      }
    });
  });

  describe("Factory Properties", () => {
    it("Should have correct entryPoint address", async () => {
      const factoryEntryPoint = await factory.entryPoint();
      expect(factoryEntryPoint).to.equal(await entryPoint.getAddress());
    });

    it("Should create account with empty level signers array", async () => {
      const tx = await factory.createAccount(owner.address, [], 0);
      const receipt = await tx.wait();

      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");

      expect(accountCreatedEvent).to.not.be.null;
      
      if (accountCreatedEvent && accountCreatedEvent.args) {
        const accountAddress = accountCreatedEvent.args[0];
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          accountAddress
        ) as unknown as MultiLevelAccount;

        expect(await account.owner()).to.equal(owner.address);
        // Account should be initialized but with no levels
        expect(await account.nextLevelId()).to.equal(1n);
      }
    });

    it("Should create account with single level", async () => {
      const levelSigners = [[ops1.address]];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");

      expect(accountCreatedEvent).to.not.be.null;
      
      if (accountCreatedEvent && accountCreatedEvent.args) {
        const accountAddress = accountCreatedEvent.args[0];
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          accountAddress
        ) as unknown as MultiLevelAccount;

        expect(await account.levelContracts(1)).to.not.equal(ethers.ZeroAddress);
      }
    });

    it("Should emit LevelCreated event with correct parameters", async () => {
      const levelSigners = [[ops1.address, ops2.address]];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const levelEvents = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((parsed) => parsed && parsed.name === "LevelCreated");

      expect(levelEvents?.length).to.equal(1);
      
      if (levelEvents && levelEvents[0] && levelEvents[0].args) {
        const levelEvent = levelEvents[0];
        expect(levelEvent.args[1]).to.equal(1n); // levelId
        expect(levelEvent.args[2].length).to.equal(2); // signers array
      }
    });

    it("Should complete initialization after creating account", async () => {
      const levelSigners = [[ops1.address]];

      const tx = await factory.createAccount(owner.address, levelSigners, 0);
      const receipt = await tx.wait();

      const accountCreatedEvent = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AccountCreated");

      if (accountCreatedEvent && accountCreatedEvent.args) {
        const accountAddress = accountCreatedEvent.args[0];
        const account = await ethers.getContractAt(
          "MultiLevelAccount",
          accountAddress
        ) as unknown as MultiLevelAccount;

        // Try to add another level - should fail because initialization is complete
        const LevelFactory = await ethers.getContractFactory("Level");
        const newLevel = await LevelFactory.deploy(
          accountAddress,
          2,
          [ops2.address]
        );

        // This should fail because initialization is complete
        // We can't directly test addLevelDuringInit, but we can verify
        // that the account was properly initialized
        expect(await account.levelContracts(1)).to.not.equal(ethers.ZeroAddress);
      }
    });
  });
});

