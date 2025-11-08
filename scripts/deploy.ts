import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", await ethers.provider.getBalance(deployer.address));
  
  // 1. Deploy or get EntryPoint
  const entryPointAddress = process.env.ENTRYPOINT_ADDRESS || 
    await deployEntryPoint();
  
  console.log("EntryPoint:", entryPointAddress);
  
  // 2. Deploy Factory
  const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
  const factory = await Factory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  
  console.log("Factory deployed:", await factory.getAddress());
  
  // 3. Create example account
  const owner = deployer.address;
  const levelSigners = [
    [
      process.env.LEVEL1_SIGNER1 || deployer.address,
      process.env.LEVEL1_SIGNER2 || deployer.address,
      process.env.LEVEL1_SIGNER3 || deployer.address
    ],
    [
      process.env.LEVEL2_SIGNER1 || deployer.address,
      process.env.LEVEL2_SIGNER2 || deployer.address
    ],
    [
      process.env.LEVEL3_SIGNER1 || deployer.address
    ]
  ];
  
  const tx = await factory.createAccount(owner, levelSigners, 0);
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
    .find((parsed) => parsed && parsed.name === 'AccountCreated');
  
  if (!accountCreatedEvent || !accountCreatedEvent.args) {
    throw new Error("AccountCreated event not found");
  }
  
  const accountAddress = accountCreatedEvent.args[0];
  
  console.log("MultiLevelAccount deployed:", accountAddress);
  
  // 4. Configure amount ranges
  const account = await ethers.getContractAt("MultiLevelAccount", accountAddress);
  
  await account.connect(deployer).configureAmountRange(
    0,
    ethers.parseEther("10000"),
    [1],
    [2],
    [3600]
  );
  
  await account.connect(deployer).configureAmountRange(
    ethers.parseEther("10001"),
    ethers.parseEther("1000000"),
    [1, 2],
    [2, 2],
    [3600, 7200]
  );
  
  await account.connect(deployer).configureAmountRange(
    ethers.parseEther("1000001"),
    ethers.MaxUint256,
    [1, 2, 3],
    [3, 2, 1],
    [3600, 7200, 86400]
  );
  
  console.log("Configuration complete!");
  
  // 5. Verify contracts (if API key provided)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying contracts...");
    await verifyContracts(factory, account);
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Factory:", await factory.getAddress());
  console.log("Account:", accountAddress);
  console.log("EntryPoint:", entryPointAddress);
  console.log("Owner:", owner);
}

async function deployEntryPoint(): Promise<string> {
  // For testing, deploy MockEntryPoint
  // In production, use the official EntryPoint address
  const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  return await entryPoint.getAddress();
}

async function verifyContracts(factory: any, account: any) {
  // Etherscan verification would go here
  // This is a placeholder
  console.log("Contract verification not implemented in this script");
  console.log("Use hardhat verify command separately");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

