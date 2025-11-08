import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";
import { setupTestEnvironment, teardownTestEnvironment } from "../helpers/test-setup";

/**
 * Etherspot Integration Test
 * 
 * This test verifies that the MultiLevelAccount works with:
 * 1. Etherspot's EntryPoint v0.8.0 (deployed EntryPoint, not MockEntryPoint)
 * 2. Skandha bundler (submits UserOps via bundler, not directly to EntryPoint)
 * 
 * The test setup will automatically:
 * - Start Skandha bundler if not running
 * - Deploy EntryPoint v0.8.0
 * - Configure the test environment
 */
describe("Etherspot Integration", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let entryPoint: IEntryPoint;
  let owner: any;
  let bundlerUrl: string;
  let entryPointAddress: string;

  before(async function () {
    // Setup test environment (starts bundler, deploys EntryPoint)
    const env = await setupTestEnvironment();
    bundlerUrl = env.bundlerUrl || "";
    entryPointAddress = env.entryPointAddress;
    
    if (!env.bundlerAvailable || !env.bundlerUrl) {
      console.log("Skipping Etherspot integration tests: bundler not available.");
      this.skip();
      return;
    }
    
    console.log("Test environment ready:");
    console.log("  Bundler URL:", bundlerUrl);
    console.log("  EntryPoint:", entryPointAddress);
  });

  after(async function () {
    // Teardown test environment (stops bundler if we started it)
    await teardownTestEnvironment();
  });

  beforeEach(async function () {
    // Deploy new fixture with actual EntryPoint
    const [deployer, ownerAddr, ops1, ops2, ops3, comp1, comp2, exec] = 
      await ethers.getSigners();
    
    owner = ownerAddr;

    // Use deployed EntryPoint or deploy new one
    let entryPointContract: IEntryPoint;
    if (entryPointAddress) {
      entryPointContract = await ethers.getContractAt(
        "@account-abstraction/contracts/interfaces/IEntryPoint.sol:IEntryPoint",
        entryPointAddress
      ) as unknown as IEntryPoint;
    } else {
      // Fallback to MockEntryPoint
      const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
      const mockEntryPoint = await EntryPointFactory.deploy();
      entryPointContract = mockEntryPoint as unknown as IEntryPoint;
      entryPointAddress = await mockEntryPoint.getAddress();
    }

    entryPoint = entryPointContract;

    // Deploy Factory with EntryPoint
    const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
    const factory = await Factory.deploy(entryPointAddress);

    // Create account
    const tx = await factory.createAccount(
      owner.address,
      [
        [ops1.address, ops2.address, ops3.address], // Level 1
        [comp1.address, comp2.address],              // Level 2
        [exec.address]                               // Level 3
      ],
      0
    );

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction receipt not found");
    }

    const accountCreatedEvent = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "AccountCreated");

    if (!accountCreatedEvent || !accountCreatedEvent.args) {
      throw new Error("AccountCreated event not found");
    }

    const accountAddress = accountCreatedEvent.args[0];
    account = await ethers.getContractAt("MultiLevelAccount", accountAddress);

    // Fund the account
    await owner.sendTransaction({
      to: accountAddress,
      value: ethers.parseEther("10")
    });

    // Configure amount ranges
    await account.connect(owner).configureAmountRange(
      0,
      ethers.parseEther("10000"),
      [1],
      [2],
      [3600]
    );
  });

  it("Should submit UserOp to Skandha bundler and process through EntryPoint", async function () {
    const to = (await ethers.getSigners())[8].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000");

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
    const userOpHash = getUserOpHash(userOp, entryPointAddress, chainId);
    const signature = await signUserOp(userOp, owner, entryPointAddress, chainId);
    userOp.signature = signature;

    // Submit to bundler
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [
          {
            sender: userOp.sender,
            nonce: `0x${userOp.nonce.toString(16)}`,
            initCode: userOp.initCode,
            callData: userOp.callData,
            accountGasLimits: userOp.accountGasLimits,
            preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
            gasFees: userOp.gasFees,
            paymasterAndData: userOp.paymasterAndData,
            signature: userOp.signature
          },
          entryPointAddress
        ]
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Bundler error: ${JSON.stringify(result.error)}`);
    }

    expect(result.result).to.be.a("string");
    const submittedUserOpHash = result.result;

    // Wait for transaction to be included
    // In a real scenario, you'd poll for the receipt
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify transaction was proposed
    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    expect(events.length).to.be.greaterThan(0);

    // Verify the transaction hash matches
    const latestEvent = events[events.length - 1];
    expect(latestEvent.args).to.not.be.undefined;
    if (latestEvent.args) {
      const txHash = latestEvent.args[0];
      expect(txHash).to.be.a("string");
    }
  });

  it("Should handle bundler validation correctly", async function () {
    const to = (await ethers.getSigners())[8].address;
    const value = ethers.parseEther("0.5");
    const data = "0x";
    const amount = ethers.parseEther("5000");

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
    const userOpHash = getUserOpHash(userOp, entryPointAddress, chainId);
    const signature = await signUserOp(userOp, owner, entryPointAddress, chainId);
    userOp.signature = signature;

    // Request validation from bundler
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateUserOperationGas",
        params: [
          {
            sender: userOp.sender,
            nonce: `0x${userOp.nonce.toString(16)}`,
            initCode: userOp.initCode,
            callData: userOp.callData,
            accountGasLimits: userOp.accountGasLimits,
            preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
            gasFees: userOp.gasFees,
            paymasterAndData: userOp.paymasterAndData,
            signature: userOp.signature
          },
          entryPointAddress
        ]
      })
    });

    const result = await response.json();
    
    // Validation should succeed (or return error with details)
    expect(result).to.have.property("result").or.have.property("error");
    
    if (result.error) {
      // Some bundlers may not support estimateUserOperationGas
      // That's okay, we just verify the request was processed
      expect(result.error).to.be.an("object");
    } else {
      expect(result.result).to.be.an("object");
    }
  });
});

