# Contract Architecture

This document describes the architecture of the Multi-Level Sequential Approval System.

## System Overview

The system consists of three main contract types:
1. **MultiLevelAccount** - Main account contract (ERC-4337 compatible)
2. **Level** - Individual approval level contracts
3. **MultiLevelAccountFactory** - Factory for deploying accounts

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    EntryPoint (ERC-4337)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ UserOperation
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  MultiLevelAccount                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  State:                                             │   │
│  │  - amountRanges[] (routing config)                 │   │
│  │  - levelContracts[] (level addresses)              │   │
│  │  - transactions[] (tx data)                        │   │
│  │  - currentLevelIndex[] (progress tracking)         │   │
│  │  - fullyApproved[] (execution ready flag)          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Functions:                                          │   │
│  │  - execute() (propose transaction)                   │   │
│  │  - onLevelApproved() (callback from Level)          │   │
│  │  - onLevelDenied() (callback from Level)             │   │
│  │  - executeApprovedTransaction() (final execution)   │   │
│  │  - configureAmountRange() (owner config)            │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ submitTransaction()
                │ onLevelApproved()
                │ onLevelDenied()
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│   Level 1     │ │   Level 2     │
│  ┌─────────┐  │ │  ┌─────────┐  │
│  │ Signers │  │ │  │ Signers │  │
│  │ - Ops1  │  │ │  │ - Comp1 │  │
│  │ - Ops2  │  │ │  │ - Comp2 │  │
│  │ - Ops3  │  │ │  └─────────┘  │
│  └─────────┘  │ │               │
│               │ │  Functions:   │
│  Functions:   │ │  - sign()     │
│  - sign()     │ │  - deny()    │
│  - deny()     │ │  - completeTimelock()│
│  - completeTimelock()│         │
└───────────────┘ └───────────────┘
```

## Contract Interaction Flow

### 1. Transaction Proposal Flow

```
Owner → EntryPoint → MultiLevelAccount.execute()
                          │
                          ├─ Generate txHash
                          ├─ Get config for amount
                          ├─ Store transaction
                          └─ Submit to Level 1
                              │
                              └─ Level.submitTransaction()
```

### 2. Level Approval Flow

```
Signer → Level.sign()
            │
            ├─ Check authorization
            ├─ Record signature
            ├─ Increment signature count
            │
            └─ If quorum reached:
                │
                ├─ If timelock > 0:
                │   └─ Start timelock
                │       └─ Wait for expiry
                │           └─ completeTimelock()
                │
                └─ If timelock == 0:
                    └─ Immediately approve
                        │
                        └─ Level.onLevelApproved()
                            │
                            └─ MultiLevelAccount.onLevelApproved()
                                │
                                ├─ Increment currentLevelIndex
                                │
                                └─ If more levels:
                                    └─ Submit to next level
                                └─ If all levels done:
                                    └─ Mark fullyApproved = true
```

### 3. Transaction Execution Flow

```
Anyone → MultiLevelAccount.executeApprovedTransaction()
            │
            ├─ Check fullyApproved
            ├─ Clean up storage
            └─ Execute transaction
                │
                └─ to.call{value: value}(data)
```

### 4. Denial Flow

```
Signer → Level.deny()
            │
            ├─ Record denial
            ├─ Mark denied = true
            └─ Level.onLevelDenied()
                │
                └─ MultiLevelAccount.onLevelDenied()
                    │
                    ├─ Emit TransactionDenied event
                    └─ Clean up storage
```

## Data Structures

### AmountRange

```solidity
struct AmountRange {
    uint256 minAmount;      // Minimum amount (inclusive)
    uint256 maxAmount;      // Maximum amount (inclusive)
    uint256[] levelIds;     // Required level IDs in sequence
    uint256[] quorums;      // Required quorum per level
    uint256[] timelocks;    // Timelock duration per level (seconds)
}
```

**Example:**
```solidity
{
    minAmount: 1000001 ether,
    maxAmount: type(uint256).max,
    levelIds: [1, 2, 3],
    quorums: [3, 2, 1],
    timelocks: [3600, 7200, 86400]  // 1hr, 2hr, 24hr
}
```

### Transaction

```solidity
struct Transaction {
    address to;             // Destination address
    uint256 value;          // ETH value
    bytes data;             // Call data
    uint256 amount;         // Amount for routing logic
    uint256 proposedAt;     // Timestamp
    AmountRange config;         // Snapshot of config at proposal
}
```

### ApprovalState (Level)

```solidity
struct ApprovalState {
    bool submitted;          // Whether transaction submitted
    uint256 requiredQuorum; // Required signatures
    uint256 signatureCount; // Current signature count
    uint256 timelockDuration; // Timelock duration (seconds)
    uint256 timelockEnd;    // When timelock expires (0 if not started)
    bool approved;          // Whether approved
    bool denied;            // Whether denied
}
```

## State Management

### MultiLevelAccount State

1. **amountRanges[]** - Sorted array of amount range configurations
2. **levelContracts[]** - Mapping from levelId to Level contract address
3. **transactions[]** - Mapping from txHash to Transaction struct
4. **currentLevelIndex[]** - Mapping from txHash to current level index (0-based)
5. **fullyApproved[]** - Mapping from txHash to boolean (ready for execution)

### Level State

1. **signers[]** - Array of authorized signer addresses
2. **isSigner[]** - Mapping from address to boolean (quick lookup)
3. **approvalStates[]** - Mapping from txHash to ApprovalState
4. **signatures[]** - Mapping from (txHash, signer) to boolean
5. **denials[]** - Mapping from (txHash, signer) to boolean

## Transaction Lifecycle

### States

1. **Proposed** - Transaction created, submitted to Level 1
2. **Level X Pending** - Waiting for signatures at Level X
3. **Level X Quorum Reached** - Quorum met, timelock active (if applicable)
4. **Level X Approved** - Level X complete, moving to next level
5. **Fully Approved** - All levels complete, ready for execution
6. **Executed** - Transaction executed on-chain
7. **Denied** - Transaction denied at any level (terminal state)

### State Transitions

```
Proposed
  ↓
Level 1 Pending
  ↓ (signatures)
Level 1 Quorum Reached
  ↓ (timelock expires)
Level 1 Approved
  ↓
Level 2 Pending
  ↓ (signatures)
Level 2 Quorum Reached
  ↓ (timelock expires)
Level 2 Approved
  ↓
...
  ↓
Fully Approved
  ↓ (executeApprovedTransaction)
Executed

(Any state can transition to Denied via veto)
```

## Amount Routing Logic

The routing algorithm:

1. When a transaction is proposed with an `amount`, the system searches `amountRanges[]`
2. Finds the first range where `minAmount <= amount <= maxAmount`
3. Uses that range's configuration:
   - `levelIds[]` - determines which levels to go through
   - `quorums[]` - determines quorum requirement at each level
   - `timelocks[]` - determines timelock duration at each level

**Important:** The `amount` parameter may differ from the ETH `value`. This allows routing based on the "value" of the transaction (e.g., token amount) rather than just ETH sent.

## Level Progression Mechanism

1. MultiLevelAccount maintains `currentLevelIndex[txHash]` starting at 0
2. When Level X calls `onLevelApproved()`:
   - Verify it's the expected level (check `config.levelIds[currentLevelIndex]`)
   - Increment `currentLevelIndex`
   - If `currentLevelIndex < config.levelIds.length`:
     - Submit to next level: `levelContracts[nextLevelId].submitTransaction(...)`
   - Else:
     - Set `fullyApproved[txHash] = true`
     - Emit `ReadyForExecution` event

## Event System

### MultiLevelAccount Events

- `TransactionProposed` - New transaction proposed
- `LevelCompleted` - A level completed approval
- `ReadyForExecution` - All levels approved
- `TransactionExecuted` - Transaction executed
- `TransactionDenied` - Transaction denied
- `AmountRangeConfigured` - New amount range added
- `LevelAdded` - New level added

### Level Events

- `TransactionSubmitted` - Transaction submitted to level
- `Signed` - Signer signed transaction
- `QuorumReached` - Quorum reached, timelock started
- `Denied` - Transaction denied
- `LevelApproved` - Level approved (ready for next level)
- `SignerAdded` - New signer added
- `SignerRemoved` - Signer removed

## Security Patterns

### Checks-Effects-Interactions

All state changes occur before external calls:

```solidity
// 1. Checks
if (!fullyApproved[txHash]) revert NotFullyApproved();

// 2. Effects
delete transactions[txHash];
delete currentLevelIndex[txHash];
delete fullyApproved[txHash];

// 3. Interactions
(bool success, bytes memory returnData) = txn.to.call{value: txn.value}(txn.data);
```

### Access Control

- **onlyEntryPoint** - Only EntryPoint can call `execute` and `validateUserOp`
- **onlyOwner** - Only owner can configure ranges and add levels
- **onlyLevel** - Only Level contracts can call callbacks
- **onlySigner** - Only authorized signers can sign/deny

### Reentrancy Protection

- Storage cleaned before external calls
- No recursive calls possible
- State transitions are atomic

## Gas Optimization

- Sorted amount ranges for efficient lookup (though linear search is used for simplicity)
- Mapping-based lookups for O(1) access
- Event-based monitoring instead of polling
- Storage cleanup after execution/denial

## Upgradeability

The contracts are **not upgradeable** by design for security. Configuration changes are possible via:
- Adding/removing amount ranges
- Adding new levels
- Updating level addresses
- Adding/removing signers at levels

However, the core logic cannot be changed after deployment.

