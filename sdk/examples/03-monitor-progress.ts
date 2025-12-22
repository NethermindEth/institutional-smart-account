import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";
import { createPublicClient, http } from "viem";

/**
 * Example: Monitor transaction progress
 */
async function monitorProgress() {
  // Setup public client (read-only)
  const rpcUrl = "http://localhost:8545";
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  
  // Initialize SDK (read-only, no signer needed)
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    publicClient
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

