import { ethers } from "ethers";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Propose a transaction via ERC-4337 UserOp
 */
async function proposeTransaction() {
  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  // Initialize SDK
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    signer
  );
  
  // Propose transaction
  const to = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";
  const value = ethers.parseEther("1");
  const data = "0x";
  const amount = ethers.parseEther("5000"); // Amount for routing
  
  const txHash = await sdk.proposeTransaction(
    to,
    value,
    data,
    amount
    // bundlerUrl is optional - omit for direct EntryPoint submission
  );
  
  console.log("Transaction proposed:", txHash);
  
  // Monitor progress
  const unsubscribe = sdk.monitorTransaction(txHash, (status) => {
    console.log("Status update:", {
      currentLevel: status.currentLevelIndex,
      fullyApproved: status.fullyApproved,
      levelStatuses: status.levelStatuses
    });
  });
  
  // Clean up when done
  // unsubscribe();
}

proposeTransaction().catch(console.error);

