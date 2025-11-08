# Integration Guide

Complete step-by-step guide for integrating the Multi-Level Account SDK into your application.

## Table of Contents

1. [Installation](#installation)
2. [Basic Setup](#basic-setup)
3. [Proposing Transactions](#proposing-transactions)
4. [Signing Transactions](#signing-transactions)
5. [Monitoring Progress](#monitoring-progress)
6. [Executing Transactions](#executing-transactions)
7. [Common Integration Patterns](#common-integration-patterns)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)
10. [Production Considerations](#production-considerations)
11. [Security Recommendations](#security-recommendations)

## Installation

```bash
npm install viem permissionless
```

The SDK uses `viem` for blockchain interactions and `permissionless.js` for ERC-4337 UserOperation handling.

## Basic Setup

### 1. Import Dependencies

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "./sdk/src/MultiLevelAccountSDK";
```

### 2. Setup viem Clients

```typescript
// For mainnet
const publicClient = createPublicClient({
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY")
});

// For testnet
const publicClient = createPublicClient({
  transport: http("https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY")
});

// For local development
const publicClient = createPublicClient({
  transport: http("http://localhost:8545")
});

// Create wallet client (owner for proposing, signers for approving)
const account = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  transport: http("http://localhost:8545") // Use same RPC URL
});
```

### 3. Initialize SDK

```typescript
const sdk = new MultiLevelAccountSDK(
  "0x...",        // MultiLevelAccount contract address
  "0x...",        // ERC-4337 EntryPoint address
  publicClient,   // viem PublicClient
  walletClient,   // viem WalletClient (optional, required for proposing)
  bundlerUrl      // Optional: Bundler URL (e.g., "http://localhost:14337/rpc")
);
```

**Contract Addresses:**
- **Account Address**: Deployed MultiLevelAccount contract
- **EntryPoint Address**: Standard ERC-4337 EntryPoint (e.g., `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` on mainnet)

## Proposing Transactions

Only the account owner can propose transactions via ERC-4337 UserOperations.

### Basic Proposal

```typescript
import { parseEther } from "viem";

const txHash = await sdk.proposeTransaction(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", // to: destination address
  parseEther("1"),                              // value: ETH to send
  "0x",                                         // data: call data (empty for simple transfers)
  parseEther("5000"),                           // amount: for routing logic
  "http://localhost:14337/rpc"                 // bundler URL (optional)
);
```

### With Bundler (Production)

```typescript
const txHash = await sdk.proposeTransaction(
  to,
  value,
  data,
  amount,
  "https://bundler.example.com/rpc" // bundler URL
);
```

### With Custom Call Data

```typescript
// For ERC-20 transfer
const tokenAddress = "0x...";
const recipient = "0x...";
const amount = ethers.parseUnits("100", 18);

const tokenInterface = new ethers.Interface([
  "function transfer(address to, uint256 amount) returns (bool)"
]);
const callData = tokenInterface.encodeFunctionData("transfer", [recipient, amount]);

const txHash = await sdk.proposeTransaction(
  tokenAddress,
  0n,              // no ETH value
  callData,
  amount           // use token amount for routing
);
```

## Signing Transactions

Signers at each level approve transactions sequentially.

### Setup Signer Interface

```typescript
// Get interface for level 1
const level1Interface = sdk.getSignerInterface(1);

// Initialize (loads Level contract)
await level1Interface.initialize();

// Reuse the same interface for multiple operations
```

### Get Pending Transactions

```typescript
const pending = await level1Interface.getPendingTransactions();

for (const tx of pending) {
  console.log(`Transaction ${tx.txHash}:`);
  console.log(`  To: ${tx.to}`);
  console.log(`  Value: ${ethers.formatEther(tx.value)} ETH`);
  console.log(`  Amount: ${ethers.formatEther(tx.amount)}`);
  console.log(`  Signatures: ${tx.signaturesCollected}/${tx.signaturesRequired}`);
  console.log(`  Timelock: ${tx.timelockRemaining} seconds`);
}
```

### Sign Transaction

```typescript
// Check if already signed
const myStatus = await level1Interface.getMyStatus(txHash);
if (!myStatus.signed && !myStatus.denied) {
  await level1Interface.sign(txHash);
  console.log("Transaction signed!");
}
```

### Deny Transaction (Veto)

```typescript
// Any signer can deny at any time
await level1Interface.deny(txHash);
console.log("Transaction denied");
```

### Complete Timelock

After quorum is reached and timelock expires, anyone can complete it:

```typescript
// Check timelock status
const pending = await level1Interface.getPendingTransactions();
const tx = pending.find(t => t.txHash === txHash);

if (tx && tx.timelockRemaining === 0 && tx.signaturesCollected >= tx.signaturesRequired) {
  await level1Interface.completeTimelock(txHash);
  console.log("Timelock completed, transaction progressing to next level");
}
```

### Subscribe to New Transactions

```typescript
const unsubscribe = level1Interface.onNewTransaction((txHash) => {
  console.log(`New transaction at level 1: ${txHash}`);
  // Handle new transaction
});

// Later: clean up
unsubscribe();
```

## Monitoring Progress

Monitor transaction progress across all levels in real-time.

### Basic Monitoring

```typescript
const unsubscribe = sdk.monitorTransaction(txHash, (status) => {
  console.log(`Transaction ${status.txHash}:`);
  console.log(`  Current Level: ${status.currentLevelIndex + 1} of ${status.levelStatuses.length}`);
  console.log(`  Fully Approved: ${status.fullyApproved}`);
  
  status.levelStatuses.forEach((level, index) => {
    console.log(`  Level ${level.levelId}:`);
    console.log(`    Submitted: ${level.submitted}`);
    console.log(`    Approved: ${level.approved}`);
    console.log(`    Denied: ${level.denied}`);
    console.log(`    Signatures: ${level.signaturesCollected}/${level.signaturesRequired}`);
    console.log(`    Timelock: ${level.timelockRemaining}s`);
  });
  
  if (status.fullyApproved) {
    console.log("Ready for execution!");
  }
});

// Clean up when done
unsubscribe();
```

### Get Current Status

```typescript
const status = await sdk.getTransactionStatus(txHash);

if (status.fullyApproved) {
  // Ready to execute
} else if (status.levelStatuses.some(l => l.denied)) {
  // Transaction denied
} else {
  // Still in progress
  const currentLevel = status.levelStatuses[status.currentLevelIndex];
  console.log(`Waiting for level ${currentLevel.levelId}`);
}
```

## Executing Transactions

Once all levels approve, anyone can execute the transaction.

### Basic Execution

```typescript
const status = await sdk.getTransactionStatus(txHash);

if (status.fullyApproved) {
  const txReceipt = await sdk.executeApprovedTransaction(txHash);
  console.log("Transaction executed:", txReceipt);
} else {
  console.log("Transaction not yet fully approved");
}
```

### With Confirmation

```typescript
const tx = await sdk.executeApprovedTransaction(txHash);
const receipt = await tx.wait();

if (receipt.status === 1) {
  console.log("Transaction executed successfully");
} else {
  console.log("Transaction failed");
}
```

## Common Integration Patterns

### Pattern 1: Owner Proposes, Signers Approve

```typescript
// Owner proposes
const ownerSDK = new MultiLevelAccountSDK(accountAddress, entryPointAddress, owner);
const txHash = await ownerSDK.proposeTransaction(to, value, data, amount);

// Signer 1 approves
const signer1SDK = new MultiLevelAccountSDK(accountAddress, entryPointAddress, signer1);
const level1Interface = signer1SDK.getSignerInterface(1);
await level1Interface.initialize();
await level1Interface.sign(txHash);

// Signer 2 approves
const signer2SDK = new MultiLevelAccountSDK(accountAddress, entryPointAddress, signer2);
const level2Interface = signer2SDK.getSignerInterface(2);
await level2Interface.initialize();
await level2Interface.sign(txHash);
```

### Pattern 2: Automated Signing Service

```typescript
class SigningService {
  private sdk: MultiLevelAccountSDK;
  private interfaces: Map<number, SignerInterface> = new Map();
  
  constructor(accountAddress: string, entryPointAddress: string, signer: Signer) {
    this.sdk = new MultiLevelAccountSDK(accountAddress, entryPointAddress, signer);
  }
  
  async initializeLevel(levelId: number) {
    const interface = this.sdk.getSignerInterface(levelId);
    await interface.initialize();
    this.interfaces.set(levelId, interface);
    
    // Subscribe to new transactions
    interface.onNewTransaction(async (txHash) => {
      await this.handleNewTransaction(levelId, txHash);
    });
  }
  
  private async handleNewTransaction(levelId: number, txHash: string) {
    const interface = this.interfaces.get(levelId);
    if (!interface) return;
    
    // Auto-sign (or implement approval logic)
    const myStatus = await interface.getMyStatus(txHash);
    if (!myStatus.signed && !myStatus.denied) {
      await interface.sign(txHash);
    }
  }
}
```

### Pattern 3: Transaction Status Dashboard

```typescript
class TransactionDashboard {
  private sdk: MultiLevelAccountSDK;
  private subscriptions: Map<string, () => void> = new Map();
  
  constructor(accountAddress: string, entryPointAddress: string, provider: Provider) {
    this.sdk = new MultiLevelAccountSDK(accountAddress, entryPointAddress, provider);
  }
  
  watchTransaction(txHash: string, onUpdate: (status: TransactionStatus) => void) {
    const unsubscribe = this.sdk.monitorTransaction(txHash, onUpdate);
    this.subscriptions.set(txHash, unsubscribe);
  }
  
  stopWatching(txHash: string) {
    const unsubscribe = this.subscriptions.get(txHash);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(txHash);
    }
  }
  
  async getStatus(txHash: string) {
    return await this.sdk.getTransactionStatus(txHash);
  }
}
```

## Error Handling

### SDK Errors

```typescript
try {
  await sdk.proposeTransaction(...);
} catch (error) {
  if (error instanceof Error) {
    console.error('SDK Error:', error.message);
    // Handle SDK-specific errors
  }
}
```

### Contract Errors

```typescript
try {
  await levelInterface.sign(txHash);
} catch (error: any) {
  if (error.reason) {
    // Contract revert reason
    console.error('Contract Error:', error.reason);
    
    if (error.reason.includes('AlreadySigned')) {
      // Already signed, continue
    } else if (error.reason.includes('NotSubmitted')) {
      // Transaction not submitted to this level
    } else if (error.reason.includes('TransactionDenied')) {
      // Transaction was denied
    }
  } else {
    // Network or other errors
    console.error('Error:', error);
  }
}
```

### Network Errors

```typescript
try {
  const status = await sdk.getTransactionStatus(txHash);
} catch (error) {
  if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
    // Retry logic
    await retry(() => sdk.getTransactionStatus(txHash), { retries: 3 });
  }
}
```

## Best Practices

### 1. Initialize Once, Reuse Often

```typescript
// Good: Initialize once
const levelInterface = sdk.getSignerInterface(1);
await levelInterface.initialize();

// Reuse for multiple operations
for (const tx of pending) {
  await levelInterface.sign(tx.txHash);
}

// Bad: Initialize every time
for (const tx of pending) {
  const interface = sdk.getSignerInterface(1);
  await interface.initialize(); // Unnecessary
  await interface.sign(tx.txHash);
}
```

### 2. Clean Up Event Listeners

```typescript
// Always clean up
const unsubscribe = sdk.monitorTransaction(txHash, callback);

// When done
unsubscribe();
```

### 3. Check Status Before Actions

```typescript
// Check before signing
const myStatus = await levelInterface.getMyStatus(txHash);
if (!myStatus.signed && !myStatus.denied) {
  await levelInterface.sign(txHash);
}

// Check before executing
const status = await sdk.getTransactionStatus(txHash);
if (status.fullyApproved) {
  await sdk.executeApprovedTransaction(txHash);
}
```

### 4. Handle Timelocks

```typescript
const pending = await levelInterface.getPendingTransactions();
for (const tx of pending) {
  if (tx.timelockRemaining > 0) {
    // Wait for timelock or schedule completion
    setTimeout(async () => {
      await levelInterface.completeTimelock(tx.txHash);
    }, tx.timelockRemaining * 1000);
  }
}
```

### 5. Use TypeScript Types

```typescript
import { TransactionStatus, PendingTransaction } from './types';

const status: TransactionStatus = await sdk.getTransactionStatus(txHash);
const pending: PendingTransaction[] = await levelInterface.getPendingTransactions();
```

## Production Considerations

### 1. Use Production Bundler

```typescript
// Use production bundler URL
const bundlerUrl = process.env.BUNDLER_URL || "https://bundler.example.com/rpc";
const txHash = await sdk.proposeTransaction(..., bundlerUrl);
```

### 2. Implement Retry Logic

```typescript
async function proposeWithRetry(...args: any[]) {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sdk.proposeTransaction(...args);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 3. Monitor Gas Prices

```typescript
// Check gas prices before proposing
const feeData = await provider.getFeeData();
if (feeData.maxFeePerGas && feeData.maxFeePerGas > ethers.parseUnits("100", "gwei")) {
  console.warn("High gas prices detected");
}
```

### 4. Use Event Indexing

For production, consider using event indexing services (The Graph, Alchemy, etc.) instead of direct event queries for better performance and reliability.

### 5. Implement Rate Limiting

```typescript
class RateLimitedSDK {
  private sdk: MultiLevelAccountSDK;
  private lastCall: number = 0;
  private minInterval: number = 1000; // 1 second
  
  async proposeTransaction(...args: any[]) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
    }
    
    this.lastCall = Date.now();
    return await this.sdk.proposeTransaction(...args);
  }
}
```

## Security Recommendations

### 1. Private Key Management

**Never expose private keys in client-side code:**

```typescript
// Bad: Hardcoded or exposed
const signer = new ethers.Wallet("0x...", provider);

// Good: Environment variables (server-side)
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Better: Hardware wallet or key management service
const signer = await hardwareWallet.getSigner();
```

### 2. Validate Transactions

**Always validate transaction details before signing:**

```typescript
const pending = await levelInterface.getPendingTransactions();
for (const tx of pending) {
  // Validate destination
  if (tx.to !== expectedRecipient) {
    console.error("Unexpected recipient");
    continue;
  }
  
  // Validate amount
  if (tx.value > maxAmount) {
    console.error("Amount too high");
    continue;
  }
  
  // Sign only if valid
  await levelInterface.sign(tx.txHash);
}
```

### 3. Verify Event Authenticity

**In production, verify events come from the correct contract:**

```typescript
sdk.monitorTransaction(txHash, (status) => {
  // Verify contract address matches expected
  // This is handled by ethers.js, but be aware
});
```

### 4. Implement Access Control

**Restrict who can propose/execute:**

```typescript
// Server-side: Check if user is owner
if (userAddress !== ownerAddress) {
  throw new Error("Unauthorized");
}

await sdk.proposeTransaction(...);
```

### 5. Monitor for Anomalies

**Implement monitoring and alerting:**

```typescript
sdk.monitorTransaction(txHash, (status) => {
  // Alert on unexpected states
  if (status.levelStatuses.some(l => l.denied)) {
    sendAlert("Transaction denied", txHash);
  }
  
  // Alert on high-value transactions
  if (status.value > threshold) {
    sendAlert("High-value transaction", txHash);
  }
});
```

## Troubleshooting

### Common Issues

1. **"Signer required" error**: Make sure you're passing a Signer (not just Provider) for operations that require signing.

2. **"Level not initialized" error**: Call `initialize()` on SignerInterface before using it.

3. **Transaction not appearing**: Check that the transaction was actually proposed and submitted to the correct level.

4. **Timelock not completing**: Ensure quorum is reached and timelock has expired before calling `completeTimelock()`.

5. **Gas estimation errors**: The SDK uses simplified gas estimation. For production, implement proper gas estimation.

## Additional Resources

- [API Documentation](../API.md) - Complete API reference
- [Architecture Documentation](../ARCHITECTURE.md) - System design
- [Examples](../EXAMPLES.md) - Code examples
- [Contract Documentation](../../contracts/README.md) - Smart contract documentation

