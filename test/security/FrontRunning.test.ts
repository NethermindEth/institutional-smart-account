import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("Front-Running Protection - Security Tests", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let level1: Level;
  let owner: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    level1 = fixture.level1;
    owner = fixture.owner;
  });

  it("Should prevent front-running with timelock", async () => {
    // Timelocks provide review windows that prevent front-running
    const txHash = ethers.keccak256(ethers.toUtf8Bytes("front-running-test"));
    await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("1")
    });
    const accountSigner = await ethers.getSigner(await account.getAddress());
    await level1.connect(accountSigner).submitTransaction(txHash, 2, 3600);

    // Sign to reach quorum
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);

    // Timelock is active - provides review window
    const remaining = await level1.getTimelockRemaining(txHash);
    expect(remaining).to.be.greaterThan(0n);

    // During timelock, transaction cannot be executed
    // This prevents front-running attacks
    await expect(
      level1.completeTimelock(txHash)
    ).to.be.revertedWithCustomError(level1, "TimelockActive");
  });

  it("Should allow veto during timelock period", async () => {
    // Veto capability prevents malicious execution even after quorum
    const txHash = ethers.keccak256(ethers.toUtf8Bytes("veto-test"));
    await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("1")
    });
    const accountSigner = await ethers.getSigner(await account.getAddress());
    await level1.connect(accountSigner).submitTransaction(txHash, 2, 3600);

    // Sign to reach quorum
    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);

    // Even after quorum, can still deny during timelock
    await level1.connect(fixture.ops3).deny(txHash);

    const state = await level1.getApprovalState(txHash);
    expect(state.denied).to.be.true;
  });

  it("Should prevent execution before timelock expiry", async () => {
    // This test is for a transaction that goes through the full flow
    // We need to propose through the account, not directly to level
    // Fund both account and ensure owner has funds
    const ownerBalance = await ethers.provider.getBalance(owner.address);
    if (ownerBalance < ethers.parseEther("100")) {
      // Get funds from another account if owner is low
      const [, , , , , , , funder] = await ethers.getSigners();
      if (funder && funder.address !== owner.address) {
        await funder.sendTransaction({
          to: owner.address,
          value: ethers.parseEther("100")
        });
      }
    }
    
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("10")
    });

    const to = fixture.others[0].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000"); // Goes to level 1 only

    // Propose through EntryPoint (simplified for test)
    const nonce = await account.nonce();
    const callData = account.interface.encodeFunctionData("execute", [
      to,
      value,
      data,
      amount
    ]);

    // Use a mock approach - directly call execute via EntryPoint impersonation
    const entryPointAddress = await fixture.entryPoint.getAddress();
    
    // Ensure EntryPoint has funds for gas
    const entryPointBalance = await ethers.provider.getBalance(entryPointAddress);
    if (entryPointBalance < ethers.parseEther("10")) {
      await owner.sendTransaction({
        to: entryPointAddress,
        value: ethers.parseEther("10")
      });
    }
    
    await ethers.provider.send("hardhat_impersonateAccount", [entryPointAddress]);
    const entryPointSigner = await ethers.getSigner(entryPointAddress);
    await account.connect(entryPointSigner).execute(to, value, data, amount);

    // Get transaction hash from events
    const filter = account.filters.TransactionProposed();
    const events = await account.queryFilter(filter);
    const txHash = events[events.length - 1].args[0];

    await level1.connect(fixture.ops1).sign(txHash);
    await level1.connect(fixture.ops2).sign(txHash);

    // Try to complete before timelock expires
    await expect(
      level1.completeTimelock(txHash)
    ).to.be.revertedWithCustomError(level1, "TimelockActive");

    // Fast forward past timelock
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    // Now can complete
    await level1.completeTimelock(txHash);
  });
});

