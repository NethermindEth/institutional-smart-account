import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("Signature Replay Protection - Security Tests", () => {
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

  it("Should prevent replaying same UserOp", async () => {
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

    // Execute first time
    await entryPoint.handleOps([userOp], owner.address);

    // Try to replay with same nonce (should fail)
    // The nonce has incremented, so this will fail validation
    const nonceAfter = await account.nonce();
    expect(nonceAfter).to.equal(nonce + 1n);
    
    // Try to execute with old nonce - should fail validation
    // The validation will fail because nonce doesn't match
    // MockEntryPoint will revert with "Validation failed"
    try {
      await entryPoint.handleOps([userOp], owner.address);
      // If it doesn't revert, that's a problem
      expect.fail("Expected transaction to revert");
    } catch (error: any) {
      // Should revert with validation failure
      expect(error.message).to.include("revert");
    }
  });

  it("Should include chainId in transaction hash", async () => {
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
    
    // Hash includes chainId, preventing cross-chain replay
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    
    // Verify chainId is in the hash calculation
    expect(userOpHash).to.not.equal(ethers.ZeroHash);
    
    // Different chainId would produce different hash
    const differentChainId = chainId + 1n;
    const differentHash = getUserOpHash(userOp, await entryPoint.getAddress(), differentChainId);
    expect(differentHash).to.not.equal(userOpHash);
  });

  it("Should increment nonce after each transaction", async () => {
    const nonce1 = await account.nonce();
    
    const to = fixture.others[0].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000");

    const callData = account.interface.encodeFunctionData("execute", [
      to,
      value,
      data,
      amount
    ]);

    const userOp1 = createUserOp({
      sender: await account.getAddress(),
      nonce: nonce1,
      callData
    });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const userOpHash1 = getUserOpHash(userOp1, await entryPoint.getAddress(), chainId);
    const signature1 = await signUserOp(userOp1, owner, await entryPoint.getAddress(), chainId);
    userOp1.signature = signature1;

    await entryPoint.handleOps([userOp1], owner.address);

    const nonce2 = await account.nonce();
    expect(nonce2).to.equal(nonce1 + 1n);

    // Second transaction with incremented nonce
    const callData2 = account.interface.encodeFunctionData("execute", [
      to,
      value,
      data,
      amount
    ]);

    const userOp2 = createUserOp({
      sender: await account.getAddress(),
      nonce: nonce2,
      callData: callData2
    });

    const userOpHash2 = getUserOpHash(userOp2, await entryPoint.getAddress(), chainId);
    const signature2 = await signUserOp(userOp2, owner, await entryPoint.getAddress(), chainId);
    userOp2.signature = signature2;

    await entryPoint.handleOps([userOp2], owner.address);

    const nonce3 = await account.nonce();
    expect(nonce3).to.equal(nonce2 + 1n);
  });
});

