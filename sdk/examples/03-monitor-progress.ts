import { ethers } from "ethers";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Monitor transaction progress
 */
async function monitorProgress() {
  // Setup provider
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  // Initialize SDK (read-only, no signer needed)
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    provider
  );
  
  const txHash = "0x..."; // Transaction hash to monitor
  
  // Get current status
  const status = await sdk.getTransactionStatus(txHash);
  console.log("Current status:", {
    txHash: status.txHash,
    to: status.to,
    value: status.value.toString(),
    amount: status.amount.toString(),
    currentLevel: status.currentLevelIndex,
    fullyApproved: status.fullyApproved,
    levelStatuses: status.levelStatuses.map(ls => ({
      levelId: ls.levelId,
      signaturesCollected: ls.signaturesCollected,
      signaturesRequired: ls.signaturesRequired,
      timelockRemaining: ls.timelockRemaining,
      approved: ls.approved,
      denied: ls.denied
    }))
  });
  
  // Monitor for updates
  const unsubscribe = sdk.monitorTransaction(txHash, (status) => {
    console.log("Status update:", {
      currentLevel: status.currentLevelIndex,
      fullyApproved: status.fullyApproved,
      levelStatuses: status.levelStatuses
    });
    
    if (status.fullyApproved) {
      console.log("Transaction is ready for execution!");
      unsubscribe();
    }
  });
}

monitorProgress().catch(console.error);

