import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("Access Control - Security Tests", () => {
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

  it("Should prevent non-owner from configuring", async () => {
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

  it("Should prevent non-owner from adding levels", async () => {
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

  it("Should prevent non-EntryPoint from calling execute", async () => {
    const to = fixture.others[0].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const amount = ethers.parseEther("5000");

    await expect(
      account.connect(owner).execute(to, value, data, amount)
    ).to.be.revertedWithCustomError(account, "OnlyEntryPoint");
  });

  it("Should prevent non-Level from calling callbacks", async () => {
    const txHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

    await expect(
      account.connect(owner).onLevelApproved(txHash, 1)
    ).to.be.revertedWithCustomError(account, "Unauthorized");
  });

  it("Should prevent non-signer from signing", async () => {
    const txHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
    
    // Impersonate account to submit transaction
    await ethers.provider.send("hardhat_impersonateAccount", [await account.getAddress()]);
    await owner.sendTransaction({
      to: await account.getAddress(),
      value: ethers.parseEther("1")
    });
    const accountSigner = await ethers.getSigner(await account.getAddress());
    await level1.connect(accountSigner).submitTransaction(txHash, 2, 3600);

    await expect(
      level1.connect(fixture.others[0]).sign(txHash)
    ).to.be.revertedWithCustomError(level1, "NotSigner");
  });

  it("Should prevent non-MultiLevelAccount from submitting to level", async () => {
    const txHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

    await expect(
      level1.connect(owner).submitTransaction(txHash, 2, 3600)
    ).to.be.revertedWithCustomError(level1, "NotAuthorized");
  });

  it("Should prevent non-MultiLevelAccount from managing signers", async () => {
    await expect(
      level1.connect(owner).addSigner(fixture.others[0].address)
    ).to.be.revertedWithCustomError(level1, "NotAuthorized");
  });
});

