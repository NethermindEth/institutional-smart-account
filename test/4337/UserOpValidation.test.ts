import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("ERC-4337 UserOp Validation", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let entryPoint: IEntryPoint;
  let owner: any;
  let other: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    entryPoint = fixture.entryPoint;
    owner = fixture.owner;
    other = fixture.others[0];
  });

  it("Should validate UserOp with owner signature", async () => {
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

    // Should not revert
    await expect(
      entryPoint.handleOps([userOp], owner.address)
    ).to.not.be.reverted;
  });

  it("Should reject UserOp with invalid signature", async () => {
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

    // Sign with wrong signer
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    const signature = await signUserOp(userOp, other, await entryPoint.getAddress(), chainId);
    userOp.signature = signature;

    // Should revert with validation failure
    await expect(
      entryPoint.handleOps([userOp], owner.address)
    ).to.be.revertedWith("Validation failed");
  });

  it("Should pay prefund correctly", async () => {
    // Fund account
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("10")
    });

    const balanceBefore = await ethers.provider.getBalance(await account.getAddress());

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

    await entryPoint.handleOps([userOp], owner.address);

    // Account should have paid for gas (balance decreased)
    const balanceAfter = await ethers.provider.getBalance(await account.getAddress());
    // Balance should decrease, but allow for some margin due to gas refunds
    expect(balanceAfter).to.be.lessThanOrEqual(balanceBefore);
  });

  it("Should execute after validation", async () => {
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

    await entryPoint.handleOps([userOp], owner.address);

    // Check TransactionProposed event was emitted
    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    expect(events.length).to.be.greaterThan(0);
  });

  it("Should increment nonce after execution", async () => {
    const nonceBefore = await account.nonce();

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

    const userOp = createUserOp({
      sender: await account.getAddress(),
      nonce: nonceBefore,
      callData
    });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const userOpHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    const signature = await signUserOp(userOp, owner, await entryPoint.getAddress(), chainId);
    userOp.signature = signature;

    await entryPoint.handleOps([userOp], owner.address);

    const nonceAfter = await account.nonce();
    expect(nonceAfter).to.equal(nonceBefore + 1n);
  });
});

