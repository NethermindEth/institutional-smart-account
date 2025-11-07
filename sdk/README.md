# Multi-Level Account SDK

TypeScript SDK for interacting with Multi-Level Sequential Approval System. Provides a high-level, type-safe interface for proposing transactions, managing approvals, and monitoring transaction progress.

## Features

- **ERC-4337 Integration**: Build and sign UserOperations for transaction proposals
- **Privacy-Preserving Signer Interface**: Signers only see their level, maintaining operational security
- **Real-Time Monitoring**: Event-driven transaction status tracking
- **Type-Safe API**: Full TypeScript support with generated types
- **Comprehensive Error Handling**: Clear error messages and proper error types

## Installation

```bash
npm install ethers@^6.0.0
```

The SDK uses ethers.js v6 for blockchain interactions.

## Quick Start

### Basic Setup

```typescript
import { ethers } from "ethers";
import { MultiLevelAccountSDK } from "./src/MultiLevelAccountSDK";

// Setup provider and signer
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const owner = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Initialize SDK
const sdk = new MultiLevelAccountSDK(
  accountAddress,      // MultiLevelAccount contract address
  entryPointAddress,   // ERC-4337 EntryPoint address
  owner                // Owner signer (for proposing transactions)
);

// Propose a transaction
const txHash = await sdk.proposeTransaction(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", // to
  ethers.parseEther("1"),                       // value
  "0x",                                         // data
  ethers.parseEther("5000")                    // amount (for routing)
);
```

### Signing Transactions

```typescript
// Get signer interface for level 1
const level1Interface = sdk.getSignerInterface(1);
await level1Interface.initialize();

// Get pending transactions
const pending = await level1Interface.getPendingTransactions();

// Sign a transaction
for (const tx of pending) {
  await level1Interface.sign(tx.txHash);
}
```

### Monitoring Progress

```typescript
// Monitor transaction progress
const unsubscribe = sdk.monitorTransaction(txHash, (status) => {
  console.log(`Level ${status.currentLevelIndex} of ${status.levelStatuses.length}`);
  if (status.fullyApproved) {
    console.log("Ready for execution!");
  }
});

// Later: clean up
unsubscribe();
```

## Architecture

The SDK consists of four main components:

1. **MultiLevelAccountSDK** - Main entry point, coordinates all operations
2. **UserOpBuilder** - Constructs and signs ERC-4337 UserOperations
3. **SignerInterface** - Privacy-preserving interface for level signers
4. **EventMonitor** - Real-time transaction status monitoring

See [Architecture Documentation](./ARCHITECTURE.md) for detailed design information.

## Components

### MultiLevelAccountSDK

Main SDK class providing high-level methods:

- `proposeTransaction()` - Propose transaction via ERC-4337
- `getSignerInterface()` - Get signer interface for a level
- `monitorTransaction()` - Monitor transaction progress
- `getTransactionStatus()` - Get current transaction status
- `executeApprovedTransaction()` - Execute fully approved transaction
- `configureAmountRange()` - Configure routing (owner only)

### SignerInterface

Privacy-preserving interface for signers:

- `initialize()` - Initialize connection to Level contract
- `getPendingTransactions()` - Get transactions needing approval
- `sign()` - Approve a transaction
- `deny()` - Veto a transaction
- `completeTimelock()` - Complete timelock after expiry
- `getMyStatus()` - Check own signing status
- `getCoSigners()` - Get co-signers at this level
- `onNewTransaction()` - Subscribe to new transactions

### EventMonitor

Real-time status monitoring:

- `watchTransaction()` - Monitor with callbacks
- `getTransactionStatus()` - Get current status

### UserOpBuilder

UserOperation construction:

- `buildUserOp()` - Build UserOperation struct
- `signUserOp()` - Sign UserOperation

## Documentation

- [API Documentation](./docs/API.md) - Complete API reference
- [Integration Guide](./docs/INTEGRATION.md) - Step-by-step integration instructions
- [Architecture Documentation](./ARCHITECTURE.md) - System design and patterns
- [Examples](./docs/EXAMPLES.md) - Usage examples

## Examples

See the `examples/` directory for complete examples:

- `01-propose-via-userop.ts` - Proposing transactions
- `02-sign-transaction.ts` - Signing transactions
- `03-monitor-progress.ts` - Monitoring transaction progress
- `04-execute-approved.ts` - Executing approved transactions

## Type Definitions

The SDK provides comprehensive TypeScript types:

- `PackedUserOperation` - ERC-4337 UserOperation format
- `TransactionStatus` - Aggregated transaction status
- `LevelStatus` - Individual level status
- `PendingTransaction` - Transaction awaiting approval
- `ApprovalState` - Level approval state

See `src/types/` for complete type definitions.

## Error Handling

The SDK provides clear error messages:

```typescript
try {
  await sdk.proposeTransaction(...);
} catch (error) {
  if (error instanceof Error) {
    console.error('SDK Error:', error.message);
  } else if (error.reason) {
    console.error('Contract Error:', error.reason);
  }
}
```

## Best Practices

1. **Initialize SignerInterface Once**: Initialize and reuse for multiple operations
2. **Clean Up Event Listeners**: Always call unsubscribe from monitoring
3. **Handle Errors Gracefully**: Check error types and handle appropriately
4. **Use TypeScript Types**: Leverage type safety for better code quality
5. **Monitor Transactions**: Use event monitoring for real-time updates

See the [Integration Guide](./docs/INTEGRATION.md) for more best practices.

## Security Considerations

- **Private Key Management**: Never expose private keys in client-side code
- **Transaction Validation**: Always validate transaction details before signing
- **Event Verification**: Verify event authenticity in production

See [Architecture Documentation](./ARCHITECTURE.md) for detailed security considerations.

