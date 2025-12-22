# Multi-Level Account SDK API Documentation (viem)

This SDK is **viem-first**. The canonical implementation is in `sdk/src/` (compiled output is published under `dist/sdk/`).

## MultiLevelAccountSDK

Main SDK class for interacting with a deployed `MultiLevelAccount` + ERC-4337 `EntryPoint`.

### Constructor

```typescript
new MultiLevelAccountSDK(
  accountAddress: Address | string,
  entryPointAddress: Address | string,
  publicClientOrRpcUrl: PublicClient | string,
  walletClient?: WalletClient,
  bundlerUrl?: string
)
```

Notes:
- `publicClientOrRpcUrl` can be a pre-configured viem `PublicClient` **or** a JSON-RPC URL string.
- `walletClient` is required for any method that sends a transaction.

### Methods

#### proposeTransaction

Propose a transaction via ERC-4337 (build + sign + submit a UserOperation).

```typescript
async proposeTransaction(
  to: Address | string,
  value: bigint,
  data: Hex | string,
  amount: bigint,
  bundlerUrl?: string
): Promise<string>
```

Returns the **internal** `txHash` emitted by `MultiLevelAccount.TransactionProposed` (this is the hash used for approvals).

#### getSignerInterface

Get a signer interface for a specific approval level.

```typescript
getSignerInterface(levelId: number): SignerInterface
```

#### monitorTransaction

Monitor transaction progress with real-time updates.

```typescript
monitorTransaction(
  txHash: string,
  callback: (status: TransactionStatus) => void
): () => void
```

Returns an unsubscribe function.

#### getTransactionStatus

Get the current aggregated status across account + levels.

```typescript
async getTransactionStatus(txHash: string): Promise<TransactionStatus>
```

#### executeApprovedTransaction

Execute a fully approved transaction (sends a transaction to the account contract).

```typescript
async executeApprovedTransaction(txHash: Hex | string): Promise<string>
```

Returns the transaction hash of the execution call.

#### configureAmountRange

Owner-only helper to configure routing for a given amount range.

```typescript
async configureAmountRange(
  minAmount: bigint,
  maxAmount: bigint,
  levelIds: number[],
  quorums: number[],
  timelocks: number[]
): Promise<string>
```

Returns the transaction hash of the configuration call.

## SignerInterface

Privacy-preserving interface for signers at a specific level.

### Methods

#### initialize

Loads the level contract address for this `levelId`.

```typescript
async initialize(): Promise<void>
```

#### getPendingTransactions

Get all pending transactions at this level (not approved/denied).

```typescript
async getPendingTransactions(): Promise<PendingTransaction[]>
```

#### sign

Sign (approve) a transaction at this level.

```typescript
async sign(txHash: Hex | string): Promise<string>
```

Returns the transaction hash of the signing call. Requires a `WalletClient`.

#### deny

Deny (veto) a transaction at this level.

```typescript
async deny(txHash: Hex | string): Promise<string>
```

Returns the transaction hash of the denial call. Requires a `WalletClient`.

#### completeTimelock

Complete timelock after expiry.

```typescript
async completeTimelock(txHash: Hex | string): Promise<string>
```

Returns the transaction hash of the completion call. Requires a `WalletClient`.

#### getMyStatus

Get signing status for the connected wallet at this level.

```typescript
async getMyStatus(txHash: Hex | string): Promise<{
  signed: boolean;
  denied: boolean;
}>
```

Requires a `WalletClient`.

#### getCoSigners

Get the signer addresses at this level.

```typescript
async getCoSigners(): Promise<string[]>
```

#### onNewTransaction

Subscribe to new transactions submitted to this level. Implemented via polling on viem.

```typescript
onNewTransaction(callback: (txHash: string) => void): () => void
```

Call `initialize()` first.

## Types

### TransactionStatus

```typescript
interface TransactionStatus {
  txHash: string;
  to: string;
  value: bigint;
  amount: bigint;
  proposedAt: Date;
  currentLevelIndex: number;
  fullyApproved: boolean;
  levelStatuses: LevelStatus[];
}
```

### LevelStatus

```typescript
interface LevelStatus {
  levelId: number;
  submitted: boolean;
  approved: boolean;
  denied: boolean;
  signaturesCollected: number;
  signaturesRequired: number;
  timelockRemaining: number;
}
```

### PendingTransaction

```typescript
interface PendingTransaction {
  txHash: string;
  to: string;
  value: bigint;
  data: string;
  amount: bigint;
  signaturesCollected: number;
  signaturesRequired: number;
  timelockRemaining: number;
}
```

