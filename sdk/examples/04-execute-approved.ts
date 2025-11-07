import { ethers } from "ethers";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Execute a fully approved transaction
 */
async function executeApproved() {
  // Setup provider (anyone can execute, no signer needed)
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  // Initialize SDK
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    provider
  );
  
  const txHash = "0x..."; // Transaction hash to execute
  
  // Check if fully approved
  const status = await sdk.getTransactionStatus(txHash);
  
  if (!status.fullyApproved) {
    console.log("Transaction not yet fully approved");
    console.log("Current level:", status.currentLevelIndex);
    return;
  }
  
  // Execute the transaction
  const txReceipt = await sdk.executeApprovedTransaction(txHash);
  console.log("Transaction executed:", txReceipt);
}

executeApproved().catch(console.error);

