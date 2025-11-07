# Multi-Level Account SDK API Documentation

## MultiLevelAccountSDK

Main SDK class for interacting with MultiLevelAccount contracts.

### Constructor

```typescript
new MultiLevelAccountSDK(
  accountAddress: string,
  entryPointAddress: string,
  providerOrSigner: Provider | Signer,
  accountAbi?: any[],
  entryPointAbi?: any[]
)
```

### Methods

#### proposeTransaction

Propose a transaction via ERC-4337 UserOp.

```typescript
async proposeTransaction(
  to: string,
  value: bigint,
  data: string,
  amount: bigint,
  bundlerUrl?: string
): Promise<string>
```

Returns the transaction hash.

#### getSignerInterface

Get a signer interface for a specific level.

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

Get current transaction status.

```typescript
async getTransactionStatus(txHash: string): Promise<TransactionStatus>
```

#### executeApprovedTransaction

Execute a fully approved transaction.

```typescript
async executeApprovedTransaction(txHash: string): Promise<string>
```

#### configureAmountRange

Configure amount range routing (owner only).

```typescript
async configureAmountRange(
  minAmount: bigint,
  maxAmount: bigint,
  levelIds: number[],
  quorums: number[],
  timelocks: number[]
): Promise<void>
```

## SignerInterface

Privacy-preserving interface for signers at a specific level.

### Methods

#### initialize

Initialize the interface (loads level contract).

```typescript
async initialize(): Promise<void>
```

#### getPendingTransactions

Get all pending transactions at this level.

```typescript
async getPendingTransactions(): Promise<PendingTransaction[]>
```

#### sign

Sign (approve) a transaction.

```typescript
async sign(txHash: string): Promise<void>
```

#### deny

Deny (veto) a transaction.

```typescript
async deny(txHash: string): Promise<void>
```

#### completeTimelock

Complete timelock after expiry.

```typescript
async completeTimelock(txHash: string): Promise<void>
```

#### getMyStatus

Get signing status for current signer.

```typescript
async getMyStatus(txHash: string): Promise<{
  signed: boolean;
  denied: boolean;
}>
```

#### getCoSigners

Get all co-signers at this level.

```typescript
async getCoSigners(): Promise<string[]>
```

#### onNewTransaction

Subscribe to new transactions at this level.

```typescript
onNewTransaction(
  callback: (txHash: string) => void
): () => void
```

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

