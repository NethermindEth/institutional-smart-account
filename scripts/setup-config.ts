import { ethers } from "hardhat";

/**
 * Script to configure an existing MultiLevelAccount with amount ranges
 */
async function main() {
  const accountAddress = process.env.ACCOUNT_ADDRESS;
  if (!accountAddress) {
    throw new Error("ACCOUNT_ADDRESS environment variable is required");
  }
  
  const [deployer] = await ethers.getSigners();
  const account = await ethers.getContractAt("MultiLevelAccount", accountAddress);
  
  console.log("Configuring account:", accountAddress);
  console.log("Using signer:", deployer.address);
  
  // Configure amount ranges
  // Range 1: $0 - $10k (Level 1 only, 2-of-3, 1 hour)
  await account.connect(deployer).configureAmountRange(
    0,
    ethers.parseEther("10000"),
    [1],
    [2],
    [3600]
  );
  console.log("Configured range 1: $0 - $10k");
  
  // Range 2: $10k - $1M (Level 1 + 2, 2-of-3 and 2-of-2, 1hr + 2hr)
  await account.connect(deployer).configureAmountRange(
    ethers.parseEther("10001"),
    ethers.parseEther("1000000"),
    [1, 2],
    [2, 2],
    [3600, 7200]
  );
  console.log("Configured range 2: $10k - $1M");
  
  // Range 3: $1M+ (All 3 levels, 3-of-3, 2-of-2, 1-of-1, 1hr + 2hr + 24hr)
  await account.connect(deployer).configureAmountRange(
    ethers.parseEther("1000001"),
    ethers.MaxUint256,
    [1, 2, 3],
    [3, 2, 1],
    [3600, 7200, 86400]
  );
  console.log("Configured range 3: $1M+");
  
  console.log("Configuration complete!");
  
  // Display current configuration
  const count = await account.getAmountRangeCount();
  console.log(`\nTotal amount ranges configured: ${count}`);
  
  for (let i = 0; i < Number(count); i++) {
    const range = await account.getAmountRange(i);
    console.log(`\nRange ${i}:`);
    console.log(`  Min: ${ethers.formatEther(range.minAmount)} ETH`);
    console.log(`  Max: ${ethers.formatEther(range.maxAmount)} ETH`);
    console.log(`  Levels: ${range.levelIds.map(id => id.toString()).join(", ")}`);
    console.log(`  Quorums: ${range.quorums.map(q => q.toString()).join(", ")}`);
    console.log(`  Timelocks: ${range.timelocks.map(t => (Number(t) / 3600).toFixed(1) + "hr").join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

