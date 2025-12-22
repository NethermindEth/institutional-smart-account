import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Propose a transaction via ERC-4337 UserOp
 */
async function proposeTransaction() {
  const rpcUrl = "http://localhost:8545";
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  // Owner wallet (required for proposing; must be the on-chain account owner)
  const ownerAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account: ownerAccount,
    transport: http(rpcUrl),
  });
  
  // Initialize SDK
  const accountAddress = "0x..."; // Your MultiLevelAccount address
  const entryPointAddress = "0x..."; // EntryPoint address
  
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    entryPointAddress,
    publicClient,
    walletClient,
    // Optional default bundler URL:
    // "http://localhost:14337/rpc"
  );
  
  // Propose transaction
  const to = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";
  const value = parseEther("1");
  const data = "0x";
  const amount = parseEther("5000"); // Amount for routing
  
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

