# SDK Architecture

This document describes the architecture and design of the Multi-Level Account SDK.

## Overview

The SDK provides a TypeScript interface for interacting with Multi-Level Account contracts. It abstracts away the complexity of ERC-4337 UserOperations, event monitoring, and privacy-preserving signer interactions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Your DApp, Backend Service, etc.)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              MultiLevelAccountSDK                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Main Entry Point                                    │   │
│  │  - proposeTransaction()                             │   │
│  │  - getSignerInterface()                              │   │
│  │  - monitorTransaction()                             │   │
│  │  - executeApprovedTransaction()                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Components:                                         │   │
│  │  - UserOpBuilder (build & sign UserOps)             │   │
│  │  - SignerInterface (privacy-preserving signing)     │   │
│  │  - EventMonitor (real-time status tracking)         │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ ethers.js
                ▼
┌─────────────────────────────────────────────────────────────┐
│              Blockchain (via Provider)                      │
│  - MultiLevelAccount Contract                               │
│  - Level Contracts                                          │
│  - EntryPoint Contract                                      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### MultiLevelAccountSDK

Main SDK class that provides high-level methods for:
- Proposing transactions via ERC-4337
- Getting signer interfaces for specific levels
- Monitoring transaction progress
- Executing approved transactions
- Configuring account settings (owner only)

**Responsibilities:**
- Manage account and entryPoint contract instances
- Coordinate between components
- Provide unified API

### UserOpBuilder

Handles ERC-4337 UserOperation construction and signing.

**Responsibilities:**
- Build UserOperation structs
- Encode call data for `execute()` function
- Estimate gas limits
- Pack gas limits and fees (PackedUserOperation format)
- Sign UserOperations with owner's private key
- Compute UserOperation hash

**Key Methods:**
- `buildUserOp(params)` - Construct UserOperation
- `signUserOp(userOp, signer)` - Sign UserOperation

**Design Patterns:**
- Builder pattern for UserOperation construction
- Separation of concerns (building vs signing)

### SignerInterface

Privacy-preserving interface for signers at a specific level.

**Responsibilities:**
- Initialize connection to Level contract
- Fetch pending transactions for the level
- Sign or deny transactions
- Complete timelocks
- Subscribe to new transactions
- Query signing status

**Privacy Features:**
- Signers only see transactions at their level
- Cannot see other levels' signers or status
- Maintains operational security

**Key Methods:**
- `initialize()` - Load Level contract
- `getPendingTransactions()` - Get transactions needing approval
- `sign(txHash)` - Approve transaction
- `deny(txHash)` - Veto transaction
- `completeTimelock(txHash)` - Complete timelock after expiry
- `getMyStatus(txHash)` - Check own signing status
- `onNewTransaction(callback)` - Subscribe to new transactions

### EventMonitor

Real-time transaction status monitoring.

**Responsibilities:**
- Watch transaction progress across all levels
- Aggregate status from account and level contracts
- Provide real-time callbacks on status changes
- Query current transaction status

**Key Methods:**
- `watchTransaction(txHash, callback)` - Monitor with callbacks
- `getTransactionStatus(txHash)` - Get current status

**Event Listening:**
- Listens to `LevelCompleted` events
- Listens to `ReadyForExecution` events
- Listens to `TransactionExecuted` events
- Listens to `TransactionDenied` events

## Data Flow

### Transaction Proposal Flow

```
Application
    │
    ├─> MultiLevelAccountSDK.proposeTransaction()
    │       │
    │       ├─> UserOpBuilder.buildUserOp()
    │       │       ├─> Get nonce from account
    │       │       ├─> Encode execute() call data
    │       │       ├─> Estimate gas
    │       │       └─> Pack gas limits and fees
    │       │
    │       ├─> UserOpBuilder.signUserOp()
    │       │       ├─> Compute UserOp hash
    │       │       └─> Sign with owner's key
    │       │
    │       └─> Submit to bundler or EntryPoint
    │               │
    │               └─> EntryPoint.handleOps()
    │                       │
    │                       └─> MultiLevelAccount.execute()
    │                               │
    │                               └─> Emit TransactionProposed
```

### Signing Flow

```
Signer Application
    │
    ├─> MultiLevelAccountSDK.getSignerInterface(levelId)
    │       │
    │       └─> new SignerInterface(account, levelId, signer)
    │
    ├─> SignerInterface.initialize()
    │       │
    │       ├─> Get level contract address from account
    │       └─> Create Level contract instance
    │
    ├─> SignerInterface.getPendingTransactions()
    │       │
    │       ├─> Query TransactionSubmitted events
    │       ├─> Filter for pending (not approved/denied)
    │       ├─> Get approval state from Level
    │       └─> Get transaction details from Account
    │
    └─> SignerInterface.sign(txHash)
            │
            └─> Level.sign(txHash)
                    │
                    └─> Emit Signed event
```

### Monitoring Flow

```
Application
    │
    ├─> MultiLevelAccountSDK.monitorTransaction(txHash, callback)
    │       │
    │       └─> EventMonitor.watchTransaction(txHash, callback)
    │               │
    │               ├─> Set up event listeners
    │               │   ├─> LevelCompleted
    │               │   ├─> ReadyForExecution
    │               │   ├─> TransactionExecuted
    │               │   └─> TransactionDenied
    │               │
    │               ├─> Get initial status
    │               │   └─> EventMonitor.getTransactionStatus()
    │               │           │
    │               │           ├─> Get transaction from Account
    │               │           ├─> Get current level index
    │               │           ├─> Get level statuses
    │               │           └─> Aggregate into TransactionStatus
    │               │
    │               └─> On event: update status and call callback
```

## Design Patterns

### Privacy-Preserving Signer Interface

The `SignerInterface` is designed to maintain privacy:

1. **Level Isolation**: Each signer only interacts with their level contract
2. **Limited Visibility**: Signers can only see:
   - Transactions submitted to their level
   - Their own signing status
   - Co-signers at their level
   - Signature progress (count, not identities)
3. **No Cross-Level Access**: Cannot query other levels' status

This prevents signers from:
- Seeing who signed at other levels
- Knowing the full approval path
- Accessing other levels' signer lists

### Event-Driven Monitoring

The `EventMonitor` uses an event-driven architecture:

1. **Event Listeners**: Subscribe to relevant contract events
2. **Reactive Updates**: Callback triggered on state changes
3. **Status Aggregation**: Combines data from multiple contracts
4. **Unsubscribe Support**: Returns cleanup function

Benefits:
- Real-time updates without polling
- Efficient resource usage
- Clean subscription management

### Builder Pattern

The `UserOpBuilder` uses the builder pattern:

1. **Step-by-Step Construction**: Build UserOperation incrementally
2. **Separation of Concerns**: Building vs signing are separate
3. **Reusability**: Can build multiple UserOps with same builder

## Error Handling

### Error Types

1. **Contract Errors**: Reverted transactions
   - Caught via transaction receipts
   - Error messages from contract

2. **SDK Errors**: Invalid state or parameters
   - Thrown as JavaScript errors
   - Descriptive error messages

3. **Network Errors**: Provider/RPC failures
   - Handled by ethers.js
   - Should be caught by application

### Error Handling Strategy

```typescript
try {
  const txHash = await sdk.proposeTransaction(...);
} catch (error) {
  if (error instanceof Error) {
    // Handle SDK errors
  } else if (error.reason) {
    // Handle contract revert reasons
  } else {
    // Handle network errors
  }
}
```

## Type Safety

The SDK uses TypeScript for type safety:

- **Contract Types**: Generated via TypeChain
- **Custom Types**: Defined in `types/` directory
- **Type Inference**: Leverages TypeScript inference where possible

### Key Types

- `PackedUserOperation` - ERC-4337 UserOperation format
- `TransactionStatus` - Aggregated transaction status
- `LevelStatus` - Individual level status
- `PendingTransaction` - Transaction awaiting approval
- `ApprovalState` - Level approval state

## Gas Estimation

Currently, the SDK uses simplified gas estimation:

```typescript
private async _estimateGas(callData: string): Promise<[bigint, bigint]> {
  // Simplified - in production would use actual estimation
  return [200000n, 200000n];
}
```

**Production Considerations:**
- Should use actual gas estimation via `eth_estimateGas`
- Account for verification gas (validateUserOp)
- Account for execution gas (execute)
- Consider gas price fluctuations

## Bundler Integration

### Packed vs Unpacked UserOperation Format

The SDK uses a **packed UserOperation format** internally for gas efficiency:
- `accountGasLimits` (bytes32): Packs `verificationGasLimit` and `callGasLimit` as two uint128 values
- `gasFees` (bytes32): Packs `maxPriorityFeePerGas` and `maxFeePerGas` as two uint128 values

However, **bundlers expect the standard unpacked format** with separate fields:
- `callGasLimit` (uint256)
- `verificationGasLimit` (uint256)
- `maxFeePerGas` (uint256)
- `maxPriorityFeePerGas` (uint256)

The `submitToBundler()` method automatically converts from packed to unpacked format before submission. This design:
- **Reduces gas costs** for on-chain operations (packed format is more efficient)
- **Maintains compatibility** with standard ERC-4337 bundlers (unpacked format)
- **Hides complexity** from SDK users (conversion happens automatically)

### Bundler Submission Methods

The SDK supports both:
1. **Direct EntryPoint Submission**: For testing
2. **Bundler Submission**: For production (via `eth_sendUserOperation`)

**Bundler Flow:**
```typescript
POST /rpc
{
  "jsonrpc": "2.0",
  "method": "eth_sendUserOperation",
  "params": [userOp, entryPointAddress]
}
```

## Best Practices

### 1. Initialize SignerInterface Once

```typescript
const interface = sdk.getSignerInterface(1);
await interface.initialize(); // Do this once
// Then reuse for multiple operations
```

### 2. Clean Up Event Listeners

```typescript
const unsubscribe = sdk.monitorTransaction(txHash, callback);
// ... later
unsubscribe(); // Clean up
```

### 3. Handle Errors Gracefully

```typescript
try {
  await interface.sign(txHash);
} catch (error) {
  if (error.message.includes('AlreadySigned')) {
    // Already signed, continue
  } else {
    // Handle other errors
  }
}
```

### 4. Use TypeScript Types

```typescript
import { TransactionStatus } from './types';

const status: TransactionStatus = await sdk.getTransactionStatus(txHash);
```

### 5. Monitor Transactions

Always monitor transactions for real-time updates:

```typescript
const unsubscribe = sdk.monitorTransaction(txHash, (status) => {
  console.log(`Level ${status.currentLevelIndex} of ${status.levelStatuses.length}`);
  if (status.fullyApproved) {
    // Ready to execute
  }
});
```

## Security Considerations

### Private Key Management

- Never expose private keys in client-side code
- Use secure key management (hardware wallets, key management services)
- SignerInterface requires a Signer (not just Provider) for signing operations

### Transaction Validation

- Always validate transaction details before signing
- Check `getMyStatus()` to avoid duplicate signatures
- Verify transaction hasn't been denied

### Event Monitoring

- Verify event authenticity (check contract address)
- Handle reorgs (events may be reverted)
- Consider using event indexing services for production

## Future Enhancements

Potential improvements:

1. **Better Gas Estimation**: Actual gas estimation
2. **Batch Operations**: Support for batch transactions
3. **Off-Chain Signatures**: Support for EIP-712 structured data
4. **Multi-Chain Support**: Support for multiple networks
5. **Caching**: Cache contract state for performance
6. **Retry Logic**: Automatic retry for failed operations


