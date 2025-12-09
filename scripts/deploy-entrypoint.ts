import { ethers } from "hardhat";

/**
 * Deploy EntryPoint v0.8.0 from @account-abstraction/contracts
 * 
 * This script deploys the actual EntryPoint contract that Etherspot's
 * Skandha bundler expects (EntryPoint v0.8.0).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying EntryPoint v0.8.0 with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Deploy EntryPoint v0.8.0
  // The EntryPoint contract is in @account-abstraction/contracts/core/EntryPoint.sol
  // We need to use the actual contract, not the mock
  const EntryPointFactory = await ethers.getContractFactory(
    "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint"
  );
  
  console.log("Deploying EntryPoint...");
  const entryPoint = await EntryPointFactory.deploy();
  await entryPoint.waitForDeployment();
  
  const entryPointAddress = await entryPoint.getAddress();
  
  console.log("\n=== EntryPoint Deployment Complete ===");
  console.log("EntryPoint Address:", entryPointAddress);
  console.log("\nYou can now use this address in your bundler configuration.");
  console.log("Set ENTRYPOINT_ADDRESS environment variable to:", entryPointAddress);
  
  return entryPointAddress;
}

main()
  .then((address) => {
    console.log("\nEntryPoint deployed successfully at:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error deploying EntryPoint:", error);
    process.exit(1);
  });


