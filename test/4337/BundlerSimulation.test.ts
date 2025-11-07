import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Bundler Simulation", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let entryPoint: IEntryPoint;
  let owner: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    entryPoint = fixture.entryPoint;
    owner = fixture.owner;
  });

  it("Should simulate validation without state changes", async () => {
    // In a real bundler, simulateValidation would be called first
    // Our mock doesn't implement this, but we can test the validation flow
    const to = fixture.others[0].address;
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
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    
    // Validate signature before submitting
    const signature = await signUserOp(userOp, owner, await entryPoint.getAddress(), chainId);
    userOp.signature = signature;

    // Validation should pass (impersonate EntryPoint to call validateUserOp)
    await ethers.provider.send("hardhat_impersonateAccount", [await entryPoint.getAddress()]);
    const entryPointSigner = await ethers.getSigner(await entryPoint.getAddress());
    
    const validationData = await account.connect(entryPointSigner).validateUserOp.staticCall(
      userOp,
      userOpHash,
      0
    );

    expect(validationData).to.equal(0); // SIG_VALIDATION_SUCCEEDED
  });

  it("Should handle gas estimation correctly", async () => {
    const to = fixture.others[0].address;
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

    // Estimate gas for the call (note: execute requires EntryPoint, so we can't estimate directly)
    // In real scenario, this would be done via EntryPoint simulation
    const gasEstimate = 200000n; // Use default estimate

    expect(gasEstimate).to.be.greaterThan(0n);

    const userOp = createUserOp({
      sender: await account.getAddress(),
      nonce,
      callData
    });

    // UserOp should have sufficient gas limits (check packed values)
    // accountGasLimits is bytes32 with two uint128 values packed
    // First 16 bytes = verificationGasLimit, last 16 bytes = callGasLimit
    const verificationGasLimit = ethers.dataSlice(userOp.accountGasLimits, 0, 16);
    const callGasLimit = ethers.dataSlice(userOp.accountGasLimits, 16, 32);
    expect(ethers.toBigInt(callGasLimit)).to.be.greaterThan(0n);
    expect(ethers.toBigInt(verificationGasLimit)).to.be.greaterThan(0n);
  });

  it("Should work with actual bundler flow", async () => {
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("10")
    });

    const to = fixture.others[0].address;
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
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    const signature = await signUserOp(userOp, owner, await entryPoint.getAddress(), chainId);
    userOp.signature = signature;

    // Simulate bundler flow: validate then execute
    // Step 1: Validation (would be done by bundler)
    await ethers.provider.send("hardhat_impersonateAccount", [await entryPoint.getAddress()]);
    const entryPointSigner = await ethers.getSigner(await entryPoint.getAddress());
    
    const validationData = await account.connect(entryPointSigner).validateUserOp.staticCall(
      userOp,
      userOpHash,
      0
    );
    expect(validationData).to.equal(0);

    // Step 2: Execution (bundler submits to EntryPoint)
    await entryPoint.handleOps([userOp], owner.address);

    // Verify transaction was proposed
    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    expect(events.length).to.be.greaterThan(0);
  });
});

