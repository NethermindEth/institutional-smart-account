/**
 * SDK Test Fixtures
 * 
 * Sets up contracts and SDK instances for testing
 */

import { ethers } from "hardhat";
import { MultiLevelAccountSDK } from "../../../sdk/src/MultiLevelAccountSDK";
import { SignerMap } from "../scenarios/coSignerBehaviors";

export interface SDKFixture {
  account: any;
  factory: any;
  entryPoint: any;
  level1: any;
  level2: any;
  level3: any;
  owner: any;
  ops1: any;
  ops2: any;
  ops3: any;
  comp1: any;
  comp2: any;
  exec: any;
  others: any[];
  sdk: MultiLevelAccountSDK;
  signerMap: SignerMap;
}

export async function deploySDKFixture(): Promise<SDKFixture> {
  const [owner, ops1, ops2, ops3, comp1, comp2, exec, ...others] = 
    await ethers.getSigners();
  
  // Deploy EntryPoint
  const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
  const entryPoint = await EntryPointFactory.deploy();
  
  // Deploy Factory
  const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
  const factory = await Factory.deploy(await entryPoint.getAddress());
  
  // Create account with 3 levels
  const tx = await factory.createAccount(
    owner.address,
    [
      [ops1.address, ops2.address, ops3.address], // Level 1
      [comp1.address, comp2.address],              // Level 2
      [exec.address]                               // Level 3
    ]
  );
  
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Transaction receipt not found");
  }
  
  // Find AccountCreated event
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
  
  const account = await ethers.getContractAt("MultiLevelAccount", accountAddress);
  
  // Get level addresses
  const level1Address = await account.levelContracts(1);
  const level2Address = await account.levelContracts(2);
  const level3Address = await account.levelContracts(3);
  
  const level1 = await ethers.getContractAt("Level", level1Address);
  const level2 = await ethers.getContractAt("Level", level2Address);
  const level3 = await ethers.getContractAt("Level", level3Address);
  
  // Configure amount ranges
  await account.connect(owner).configureAmountRange(
    0,
    ethers.parseEther("10000"),
    [1],
    [2],
    [3600] // 1 hour
  );
  
  await account.connect(owner).configureAmountRange(
    ethers.parseEther("10001"),
    ethers.parseEther("1000000"),
    [1, 2],
    [2, 2],
    [3600, 7200] // 1hr, 2hr
  );
  
  await account.connect(owner).configureAmountRange(
    ethers.parseEther("1000001"),
    ethers.MaxUint256,
    [1, 2, 3],
    [3, 2, 1],
    [3600, 7200, 86400] // 1hr, 2hr, 24hr
  );
  
  // Create SDK instance
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    await entryPoint.getAddress(),
    owner // Use owner as signer for SDK
  );
  
  // Create signer map
  const signerMap: SignerMap = {
    ops1: ops1.address,
    ops2: ops2.address,
    ops3: ops3.address,
    comp1: comp1.address,
    comp2: comp2.address,
    exec: exec.address
  };
  
  return {
    account,
    factory,
    entryPoint: entryPoint,
    level1,
    level2,
    level3,
    owner,
    ops1,
    ops2,
    ops3,
    comp1,
    comp2,
    exec,
    others,
    sdk,
    signerMap
  };
}

