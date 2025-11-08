import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, MultiLevelAccountFactory, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Gas Profiling", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let factory: MultiLevelAccountFactory;
  let entryPoint: IEntryPoint;
  let level1: Level;
  let level2: Level;
  let level3: Level;
  let owner: any;
  let recipient: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    factory = fixture.factory;
    entryPoint = fixture.entryPoint;
    level1 = fixture.level1;
    level2 = fixture.level2;
    level3 = fixture.level3;
    owner = fixture.owner;
    recipient = fixture.others[0];
  });

  describe("MultiLevelAccount - Gas Profiling", () => {
    describe("execute() - Transaction Proposal", () => {
      it("Should profile gas for execute() with small amount", async () => {
        const amount = ethers.parseEther("5000");
        const value = ethers.parseEther("1");
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

        const tx = await entryPoint.handleOps([userOp], owner.address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for execute() with medium amount (2 levels)", async () => {
        const amount = ethers.parseEther("50000");
        const value = ethers.parseEther("10");
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

        const tx = await entryPoint.handleOps([userOp], owner.address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for execute() with large amount (3 levels)", async () => {
        const amount = ethers.parseEther("2000000");
        const value = ethers.parseEther("100");
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

        const tx = await entryPoint.handleOps([userOp], owner.address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("configureAmountRange() - Configuration", () => {
      it("Should profile gas for configureAmountRange() with single level", async () => {
        const tx = await account.connect(owner).configureAmountRange(
          ethers.parseEther("20000"),
          ethers.parseEther("30000"),
          [1],
          [2],
          [1800]
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for configureAmountRange() with multiple levels", async () => {
        const tx = await account.connect(owner).configureAmountRange(
          ethers.parseEther("50000"),
          ethers.parseEther("60000"),
          [1, 2],
          [2, 2],
          [1800, 3600]
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for configureAmountRange() with three levels", async () => {
        const tx = await account.connect(owner).configureAmountRange(
          ethers.parseEther("70000"),
          ethers.parseEther("80000"),
          [1, 2, 3],
          [3, 2, 1],
          [1800, 3600, 7200]
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("addLevel() - Level Management", () => {
      it("Should profile gas for addLevel()", async () => {
        const LevelFactory = await ethers.getContractFactory("Level");
        const newLevel = await LevelFactory.deploy(
          await account.getAddress(),
          4,
          [fixture.others[1].address, fixture.others[2].address]
        );

        const tx = await account.connect(owner).addLevel(await newLevel.getAddress());
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("updateLevel() - Level Updates", () => {
      it("Should profile gas for updateLevel()", async () => {
        const LevelFactory = await ethers.getContractFactory("Level");
        const newLevel = await LevelFactory.deploy(
          await account.getAddress(),
          1,
          [fixture.others[1].address, fixture.others[2].address]
        );

        const tx = await account.connect(owner).updateLevel(1, await newLevel.getAddress());
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("removeAmountRange() - Configuration Removal", () => {
      it("Should profile gas for removeAmountRange()", async () => {
        // Add a range first
        await account.connect(owner).configureAmountRange(
          ethers.parseEther("90000"),
          ethers.parseEther("100000"),
          [1],
          [2],
          [1800]
        );

        const rangeCount = await account.getAmountRangeCount();
        const tx = await account.connect(owner).removeAmountRange(rangeCount - 1n);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("executeApprovedTransaction() - Final Execution", () => {
      it("Should profile gas for executeApprovedTransaction()", async () => {
        // Fund account
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: ethers.parseEther("1000")
        });

        // Propose transaction
        const amount = ethers.parseEther("5000");
        const value = ethers.parseEther("1");
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

        // Get transaction hash
        const filter = account.filters.TransactionProposed();
        const events = await account.queryFilter(filter);
        const txHash = events[events.length - 1].args[0];

        // Approve at level 1
        await level1.connect(fixture.ops1).sign(txHash);
        await level1.connect(fixture.ops2).sign(txHash);

        // Complete timelock
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine", []);
        await level1.completeTimelock(txHash);

        // Execute approved transaction
        const tx = await account.executeApprovedTransaction(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("validateUserOp() - ERC-4337 Validation", () => {
      it("Should profile gas for validateUserOp() with valid signature", async () => {
        const amount = ethers.parseEther("5000");
        const value = ethers.parseEther("1");
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

        // Fund account for prefund
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: ethers.parseEther("10")
        });

        const tx = await entryPoint.handleOps([userOp], owner.address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });
  });

  describe("Level - Gas Profiling", () => {
    let txHash: string;

    beforeEach(async () => {
      // Propose a transaction for testing
      const amount = ethers.parseEther("5000");
      const value = ethers.parseEther("1");
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
      txHash = events[events.length - 1].args[0];
    });

    describe("submitTransaction() - Transaction Submission", () => {
      it("Should profile gas for submitTransaction() (called by account)", async () => {
        // This is already called in beforeEach via execute(), but we can verify
        const state = await level1.getApprovalState(txHash);
        expect(state.submitted).to.be.true;
      });
    });

    describe("sign() - Single Signature", () => {
      it("Should profile gas for sign() - first signature", async () => {
        const tx = await level1.connect(fixture.ops1).sign(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for sign() - second signature", async () => {
        await level1.connect(fixture.ops1).sign(txHash);
        const tx = await level1.connect(fixture.ops2).sign(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for sign() - quorum reached", async () => {
        await level1.connect(fixture.ops1).sign(txHash);
        const tx = await level1.connect(fixture.ops2).sign(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("deny() - Transaction Denial", () => {
      it("Should profile gas for deny()", async () => {
        const tx = await level1.connect(fixture.ops1).deny(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("completeTimelock() - Timelock Completion", () => {
      it("Should profile gas for completeTimelock()", async () => {
        // Reach quorum first
        await level1.connect(fixture.ops1).sign(txHash);
        await level1.connect(fixture.ops2).sign(txHash);

        // Fast forward time
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine", []);

        const tx = await level1.completeTimelock(txHash);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("addSigner() - Signer Management", () => {
      it("Should profile gas for addSigner()", async () => {
        // Impersonate the account contract to call level functions
        await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: ethers.parseEther("1")
        });
        const accountSigner = await ethers.getSigner(await account.getAddress());
        
        const tx = await level1.connect(accountSigner).addSigner(fixture.others[3].address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("removeSigner() - Signer Removal", () => {
      it("Should profile gas for removeSigner()", async () => {
        // Impersonate the account contract to call level functions
        await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
        await owner.sendTransaction({
          to: await account.getAddress(),
          value: ethers.parseEther("1")
        });
        const accountSigner = await ethers.getSigner(await account.getAddress());
        
        const tx = await level1.connect(accountSigner).removeSigner(fixture.ops3.address);
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });
  });

  describe("MultiLevelAccountFactory - Gas Profiling", () => {
    describe("createAccount() - Account Creation", () => {
      it("Should profile gas for createAccount() with 1 level", async () => {
        const tx = await factory.createAccount(
          owner.address,
          [[fixture.others[0].address, fixture.others[1].address]],
          1n
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for createAccount() with 2 levels", async () => {
        const tx = await factory.createAccount(
          owner.address,
          [
            [fixture.others[0].address, fixture.others[1].address],
            [fixture.others[2].address]
          ],
          2n
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for createAccount() with 3 levels", async () => {
        const tx = await factory.createAccount(
          owner.address,
          [
            [fixture.others[0].address, fixture.others[1].address, fixture.others[2].address],
            [fixture.others[3].address, fixture.others[4].address],
            [fixture.others[5].address]
          ],
          3n
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });

      it("Should profile gas for createAccount() with many signers", async () => {
        const signers = Array.from({ length: 10 }, (_, i) => fixture.others[i].address);
        const tx = await factory.createAccount(
          owner.address,
          [signers],
          4n
        );
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
      });
    });

    describe("computeAccountAddress() - Counterfactual Address Computation", () => {
      it("Should profile gas for computeAccountAddress()", async () => {
        const salt = 12345n;
        const levelSigners = [[fixture.ops1.address]];
        const address = await factory.computeAccountAddress(owner.address, levelSigners, salt);
        expect(address).to.be.a("string");
        expect(address).to.not.equal(ethers.ZeroAddress);
      });
    });
  });

  describe("Multi-Level Approval Flow - Cumulative Gas", () => {
    it("Should profile cumulative gas for full 1-level approval flow", async () => {
      // Fund account
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("1000")
      });

      const amount = ethers.parseEther("5000");
      const value = ethers.parseEther("1");
      const to = recipient.address;
      const data = "0x";

      // Propose
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
      const txHash = events[events.length - 1].args[0];

      // Approve
      await level1.connect(fixture.ops1).sign(txHash);
      await level1.connect(fixture.ops2).sign(txHash);

      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await level1.completeTimelock(txHash);

      // Execute
      const tx = await account.executeApprovedTransaction(txHash);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });

    it("Should profile cumulative gas for full 2-level approval flow", async () => {
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("1000")
      });

      const amount = ethers.parseEther("50000");
      const value = ethers.parseEther("10");
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
      const txHash = events[events.length - 1].args[0];

      // Level 1
      await level1.connect(fixture.ops1).sign(txHash);
      await level1.connect(fixture.ops2).sign(txHash);
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await level1.completeTimelock(txHash);

      // Level 2
      await level2.connect(fixture.comp1).sign(txHash);
      await level2.connect(fixture.comp2).sign(txHash);
      await ethers.provider.send("evm_increaseTime", [7201]);
      await ethers.provider.send("evm_mine", []);
      await level2.completeTimelock(txHash);

      // Execute
      const tx = await account.executeApprovedTransaction(txHash);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });

    it("Should profile cumulative gas for full 3-level approval flow", async () => {
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("3000")
      });

      const amount = ethers.parseEther("2000000");
      const value = ethers.parseEther("100");
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
      const txHash = events[events.length - 1].args[0];

      // Level 1
      await level1.connect(fixture.ops1).sign(txHash);
      await level1.connect(fixture.ops2).sign(txHash);
      await level1.connect(fixture.ops3).sign(txHash);
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await level1.completeTimelock(txHash);

      // Level 2
      await level2.connect(fixture.comp1).sign(txHash);
      await level2.connect(fixture.comp2).sign(txHash);
      await ethers.provider.send("evm_increaseTime", [7201]);
      await ethers.provider.send("evm_mine", []);
      await level2.completeTimelock(txHash);

      // Level 3
      await level3.connect(fixture.exec).sign(txHash);
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine", []);
      await level3.completeTimelock(txHash);

      // Execute
      const tx = await account.executeApprovedTransaction(txHash);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });
  });

  describe("Edge Cases - Gas Profiling", () => {
    it("Should profile gas with maximum signers in level", async () => {
      // Create a level with many signers
      // Generate additional signers if needed
      const signers = [];
      const signerWallets = [];
      for (let i = 0; i < 20; i++) {
        if (i < fixture.others.length) {
          signers.push(fixture.others[i].address);
          signerWallets.push(fixture.others[i]);
        } else {
          // Generate a new signer if we don't have enough
          const wallet = ethers.Wallet.createRandom();
          signers.push(wallet.address);
          // Connect the wallet to the provider for signing
          signerWallets.push(await ethers.getSigner(wallet.address));
        }
      }
      const manySigners = signers;
      const LevelFactory = await ethers.getContractFactory("Level");
      const nextLevelId = await account.nextLevelId();
      const largeLevel = await LevelFactory.deploy(
        await account.getAddress(),
        nextLevelId,
        manySigners
      );
      await largeLevel.waitForDeployment();

      const levelAddress = await largeLevel.getAddress();
      expect(levelAddress).to.not.equal(ethers.ZeroAddress);
      await account.connect(owner).addLevel(levelAddress);

      // Propose transaction
      const amount = ethers.parseEther("5000");
      const value = ethers.parseEther("1");
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
      const txHash = events[events.length - 1].args[0];

      // The transaction was submitted to level1 (because amount 5000 routes to level1)
      // But we want to test largeLevel, so let's submit a transaction directly to largeLevel
      // First, let's create a new transaction hash and submit it to largeLevel
      const largeLevelTxHash = ethers.keccak256(ethers.toUtf8Bytes("large-level-gas-test"));
      await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("1")
      });
      const accountSigner = await ethers.getSigner(await account.getAddress());
      
      await largeLevel.connect(accountSigner).submitTransaction(largeLevelTxHash, 10, 3600);

      // Sign with multiple signers using the signerWallets array
      for (let i = 0; i < 10; i++) {
        if (i < signerWallets.length) {
          // For fixture signers, use them directly
          if (i < fixture.others.length) {
            await largeLevel.connect(fixture.others[i]).sign(largeLevelTxHash);
          } else {
            // For generated wallets, fund them first
            const wallet = signerWallets[i];
            await owner.sendTransaction({
              to: await wallet.getAddress(),
              value: ethers.parseEther("1")
            });
            // Impersonate the wallet address to sign
            await ethers.provider.send("hardhat_impersonateAccount", [await wallet.getAddress()]);
            const walletSigner = await ethers.getSigner(await wallet.getAddress());
            await largeLevel.connect(walletSigner).sign(largeLevelTxHash);
          }
        }
      }
    });

    it("Should profile gas with large amount range arrays", async () => {
      const levelIds = [1, 2, 3, 1, 2];
      const quorums = [2, 2, 1, 3, 2];
      const timelocks = [1800, 3600, 7200, 1800, 3600];

      const tx = await account.connect(owner).configureAmountRange(
        ethers.parseEther("100000"),
        ethers.parseEther("200000"),
        levelIds,
        quorums,
        timelocks
      );
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });
  });
});

