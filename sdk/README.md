# Multi-Level Account SDK

TypeScript SDK for interacting with Multi-Level Sequential Approval System. Provides a high-level, type-safe interface for proposing transactions, managing approvals, and monitoring transaction progress.

## Features

- **ERC-4337 Integration**: Build and sign UserOperations using permissionless.js
- **Bundler Support**: Submit UserOperations to any ERC-4337 compatible bundler (Pimlico, Etherspot Skandha, etc.)
- **Privacy-Preserving Signer Interface**: Signers only see their level, maintaining operational security
- **Real-Time Monitoring**: Event-driven transaction status tracking
- **Type-Safe API**: Full TypeScript support with generated types
- **Comprehensive Error Handling**: Clear error messages and proper error types

## Installation

```bash
npm install viem permissionless
```

The SDK uses `viem` for blockchain interactions and `permissionless.js` for ERC-4337 UserOperation handling.

## Quick Start

### Basic Setup

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "./src/MultiLevelAccountSDK";

// Setup viem clients
const publicClient = createPublicClient({
  transport: http("http://localhost:8545")
});

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  transport: http("http://localhost:8545")
});

// Initialize SDK
const sdk = new MultiLevelAccountSDK(
  accountAddress,      // MultiLevelAccount contract address
  entryPointAddress,   // ERC-4337 EntryPoint address
  publicClient,        // viem PublicClient
  walletClient,        // viem WalletClient (optional, required for proposing)
  bundlerUrl           // Optional: Bundler URL (e.g., "http://localhost:14337/rpc")
);

// Propose a transaction via bundler
const txHash = await sdk.proposeTransaction(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", // to
  parseEther("1"),                               // value
  "0x",                                          // data
  parseEther("5000"),                            // amount (for routing)
  "http://localhost:14337/rpc"                  // bundler URL
);
```

### Using with Etherspot Skandha Bundler

```typescript
import { MultiLevelAccountSDK } from "./src/MultiLevelAccountSDK";
import { createPublicClient, createWalletClient, http } from "viem";

const publicClient = createPublicClient({
  transport: http("http://localhost:8545")
});

const walletClient = createWalletClient({
  account: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
  transport: http("http://localhost:8545")
});

const sdk = new MultiLevelAccountSDK(
  accountAddress,
  entryPointAddress, // Deploy using scripts/deploy-entrypoint.ts
  publicClient,
  walletClient,
  "http://localhost:14337/rpc" // Skandha bundler URL
);

// Propose transaction - will be submitted to Skandha bundler
const txHash = await sdk.proposeTransaction(
  recipientAddress,
  parseEther("1"),
  "0x",
  parseEther("5000")
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
2. **UserOpBuilder** - Constructs and signs ERC-4337 UserOperations using permissionless.js
3. **SignerInterface** - Privacy-preserving interface for level signers
4. **EventMonitor** - Real-time transaction status monitoring

See [Architecture Documentation](./ARCHITECTURE.md) for detailed design information.

## Components

### MultiLevelAccountSDK

Main SDK class providing high-level methods:

- `proposeTransaction()` - Propose transaction via ERC-4337 bundler
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

UserOperation construction using permissionless.js:

- `buildUserOp()` - Build UserOperation struct
- `signUserOp()` - Sign UserOperation
- `submitToBundler()` - Submit to bundler via JSON-RPC

## Bundler Integration

The SDK supports any ERC-4337 compatible bundler:

- **Etherspot Skandha**: `http://localhost:14337/rpc`
- **Pimlico**: `https://api.pimlico.io/v2/{chain}/rpc?apikey={key}`
- **Custom bundlers**: Any bundler implementing `eth_sendUserOperation` RPC method

### Setting Up Skandha Bundler

1. Deploy EntryPoint v0.8.0:
   ```bash
   npx hardhat run scripts/deploy-entrypoint.ts --network localhost
   ```

2. Configure Skandha bundler (see `test/helpers/skandha-config.json`)

3. Start Skandha bundler:
   ```bash
   npx skandha standalone --config test/helpers/skandha-config.json
   ```

4. Use in SDK:
   ```typescript
   const sdk = new MultiLevelAccountSDK(
     accountAddress,
     entryPointAddress,
     publicClient,
     walletClient,
     "http://localhost:14337/rpc"
   );
   ```

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
6. **Use Bundlers**: Prefer bundler submission over direct EntryPoint calls

See the [Integration Guide](./docs/INTEGRATION.md) for more best practices.

## Security Considerations

- **Private Key Management**: Never expose private keys in client-side code
- **Transaction Validation**: Always validate transaction details before signing
- **Event Verification**: Verify event authenticity in production
- **Bundler Trust**: Use reputable bundlers or run your own

See [Architecture Documentation](./ARCHITECTURE.md) for detailed security considerations.

## Migration from ethers.js

If you're migrating from the previous ethers.js-based SDK:

1. Replace `ethers.Provider` with `viem.PublicClient`
2. Replace `ethers.Signer` with `viem.WalletClient`
3. Update constructor calls to use viem clients
4. UserOperation building is now handled by permissionless.js internally

## Dependencies

- `viem` - Ethereum TypeScript library
- `permissionless` - ERC-4337 utilities and bundler integration
