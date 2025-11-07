import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";
import { deployFixture, DeployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

describe("EntryPoint Integration", () => {
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

  it("Should get correct userOpHash from EntryPoint", async () => {
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
    const computedHash = getUserOpHash(userOp, await entryPoint.getAddress(), chainId);
    const entryPointHash = await entryPoint.getUserOpHash(userOp);

    expect(entryPointHash).to.equal(computedHash);
  });

  it("Should handle multiple UserOps in batch", async () => {
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("10")
    });

    const to = fixture.others[0].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000");

    // Create two UserOps
    const nonce1 = await account.nonce();
    const callData1 = account.interface.encodeFunctionData("execute", [
      to,
      value,
      data,
      amount
    ]);

    const userOp1 = createUserOp({
      sender: await account.getAddress(),
      nonce: nonce1,
      callData: callData1
    });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const userOpHash1 = getUserOpHash(userOp1, await entryPoint.getAddress(), chainId);
    const signature1 = await signUserOp(userOp1, owner, await entryPoint.getAddress(), chainId);
    userOp1.signature = signature1;

    const nonce2 = await account.nonce();
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

    // Execute both
    await entryPoint.handleOps([userOp1, userOp2], owner.address);

    // Both should be proposed
    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    expect(events.length).to.be.greaterThanOrEqual(2);
  });

  it("Should validate only from EntryPoint", async () => {
    const to = fixture.others[0].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000");

    // Try to call execute directly (should fail)
    await expect(
      account.execute(to, value, data, amount)
    ).to.be.revertedWithCustomError(account, "OnlyEntryPoint");
  });
});

