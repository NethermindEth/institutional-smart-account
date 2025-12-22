import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Execute a fully approved transaction
 */
async function executeApproved() {
  // Anyone can execute, but someone still needs to pay gas for the execution tx.
  const rpcUrl = "http://localhost:8545";
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const executorAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account: executorAccount,
    transport: http(rpcUrl),
  });
  
  // Initialize SDK
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    publicClient,
    walletClient
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
  const execTxHash = await sdk.executeApprovedTransaction(txHash);
  console.log("Execution tx hash:", execTxHash);
}

executeApproved().catch(console.error);

