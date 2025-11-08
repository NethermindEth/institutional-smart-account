import { ethers } from "hardhat";
import { MultiLevelAccount, MultiLevelAccountFactory, Level } from "../../typechain-types";
import { IEntryPoint } from "../../typechain-types/@account-abstraction/contracts/interfaces";

export interface DeployFixture {
  account: MultiLevelAccount;
  factory: MultiLevelAccountFactory;
  entryPoint: IEntryPoint;
  level1: Level;
  level2: Level;
  level3: Level;
  owner: any;
  ops1: any;
  ops2: any;
  ops3: any;
  comp1: any;
  comp2: any;
  exec: any;
  others: any[];
}

export async function deployFixture(): Promise<DeployFixture> {
  const [owner, ops1, ops2, ops3, comp1, comp2, exec, ...others] = 
    await ethers.getSigners();
  
  // Ensure owner has enough funds for all tests
  // Hardhat default accounts have 10000 ETH, but we'll set up to be safe
  
  // Deploy EntryPoint (using a simple mock for now)
  // In production, you would use the actual EntryPoint address
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
    ],
    0 // salt
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
  
  const accountAddress = accountCreatedEvent.args[0]; // account is first arg
  
  const account = await ethers.getContractAt(
    "MultiLevelAccount",
    accountAddress
  ) as unknown as MultiLevelAccount;
  
  // Get level addresses
  const level1Address = await account.levelContracts(1);
  const level2Address = await account.levelContracts(2);
  const level3Address = await account.levelContracts(3);
  
  const level1 = await ethers.getContractAt("Level", level1Address) as unknown as Level;
  const level2 = await ethers.getContractAt("Level", level2Address) as unknown as Level;
  const level3 = await ethers.getContractAt("Level", level3Address) as unknown as Level;
  
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
  
  return {
    account,
    factory,
    entryPoint: entryPoint as unknown as IEntryPoint,
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
    others
  };
}

