import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

/**
 * Example: Sign a transaction as a level signer
 */
async function signTransaction() {
  const rpcUrl = "http://localhost:8545";
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  // This should be a signer key authorized at the target level
  const signerAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account: signerAccount,
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
  
  // Get signer interface for Level 1
  const level1Interface = sdk.getSignerInterface(1);
  await level1Interface.initialize();
  
  // Get pending transactions
  const pending = await level1Interface.getPendingTransactions();
  console.log("Pending transactions:", pending);
  
  if (pending.length > 0) {
    const txHash = pending[0].txHash;
    
    // Check my status
    const myStatus = await level1Interface.getMyStatus(txHash);
    console.log("My status:", myStatus);
    
    if (!myStatus.signed && !myStatus.denied) {
      // Sign the transaction
      const signTx = await level1Interface.sign(txHash);
      console.log("Sign transaction hash:", signTx);
      console.log("Transaction signed:", txHash);
    }
    
    // Check if quorum reached and timelock can be completed
    const progress = await level1Interface.getPendingTransactions();
    const tx = progress.find(t => t.txHash === txHash);
    
    if (tx && tx.signaturesCollected >= tx.signaturesRequired && tx.timelockRemaining === 0) {
      // Complete timelock
      const completeTx = await level1Interface.completeTimelock(txHash);
      console.log("CompleteTimelock tx hash:", completeTx);
      console.log("Timelock completed:", txHash);
    }
  }
}

signTransaction().catch(console.error);

