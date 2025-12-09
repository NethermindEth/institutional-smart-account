import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env file
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying Factory with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Use the standard Sepolia EntryPoint address
  const entryPointAddress = process.env.ENTRYPOINT_ADDRESS || "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  
  console.log("EntryPoint:", entryPointAddress);
  
  // Deploy Factory
  const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
  console.log("Deploying Factory...");
  const factory = await Factory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  
  console.log("\n=== Factory Deployment Complete ===");
  console.log("Factory Address:", factoryAddress);
  console.log("EntryPoint:", entryPointAddress);
  console.log("\nAdd this to your website .env.local:");
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
