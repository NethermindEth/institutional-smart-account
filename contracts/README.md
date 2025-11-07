# Smart Contracts

This directory contains the smart contracts for the Multi-Level Sequential Approval System, an ERC-4337 compatible account abstraction solution for institutional blockchain accounts.

## Overview

The system implements a multi-level approval workflow where transactions must be approved sequentially through multiple levels of signers, with amount-based routing, dynamic quorum requirements, time-locked progression, and veto capabilities.

## Contracts

### Core Contracts

#### `MultiLevelAccount.sol`
The main account contract that owns assets and orchestrates the approval flow. It implements the ERC-4337 `IAccount` interface and manages:
- Transaction proposal and execution
- Amount-based routing to different approval paths
- Level progression
- Final transaction execution after all approvals

**Key Features:**
- ERC-4337 compatible via EntryPoint
- Amount-based routing (different paths for different amounts)
- Sequential level progression
- Transaction state management
- Permissionless execution of fully approved transactions

#### `Level.sol`
Individual approval level contract implementing a custom multisig with dynamic quorum and timelock. Each level:
- Manages a set of authorized signers
- Tracks signatures and denials
- Enforces quorum requirements
- Implements timelock delays
- Provides veto capability

**Key Features:**
- Dynamic quorum per transaction
- Configurable timelock duration
- Veto capability (any signer can deny)
- Privacy-preserving (signers only see their level)

#### `MultiLevelAccountFactory.sol`
Factory contract for deploying MultiLevelAccount instances with their associated Level contracts. Handles:
- Account creation with multiple levels
- Level deployment and registration
- Counterfactual address computation (CREATE2)

### Interfaces

#### `IMultiLevelAccount.sol`
Interface for callbacks from Level contracts to MultiLevelAccount:
- `onLevelApproved(bytes32 txHash, uint256 levelId)` - Called when a level completes approval
- `onLevelDenied(bytes32 txHash, uint256 levelId, address denier)` - Called when a level denies a transaction

#### `ILevel.sol`
Interface for Level contract submission:
- `submitTransaction(bytes32 txHash, uint256 requiredQuorum, uint256 timelockDuration)` - Called by MultiLevelAccount to submit a transaction to a level

## Key Concepts

### Amount-Based Routing

Transactions are routed through different approval paths based on the transaction `amount` parameter (which may differ from the ETH `value`). Each amount range can have:
- Different level sequences
- Different quorum requirements per level
- Different timelock durations per level

Example configuration:
- 0 - 10,000 ETH: Level 1 only, quorum 2/3, 1 hour timelock
- 10,001 - 1,000,000 ETH: Levels 1 → 2, quorum 2/3 and 2/2, 1hr and 2hr timelocks
- 1,000,001+ ETH: Levels 1 → 2 → 3, quorum 3/3, 2/2, 1/1, 1hr, 2hr, 24hr timelocks

### Dynamic Quorum

Each level can have a different quorum requirement based on the transaction amount. The quorum is specified per level in the amount range configuration and enforced by the Level contract.

### Time-Locked Progression

After a level reaches quorum, a timelock period begins. The transaction cannot progress to the next level until the timelock expires. This provides a security mechanism to prevent rushed approvals.

### Veto Capability

Any signer at any level can deny (veto) a transaction at any time, even if quorum has been reached. This immediately cancels the transaction and cleans up state.

### Privacy-Preserving Design

Signers at each level only see transactions submitted to their level. They cannot see:
- Other levels' signers
- Other levels' approval status
- The full approval path

This maintains operational security while allowing distributed approval workflows.

## ERC-4337 Integration

The system is fully ERC-4337 compatible:

1. **UserOperation Validation**: The account implements `validateUserOp` to verify signatures and handle prefunding
2. **Execution**: Transactions are proposed via the `execute` function called by EntryPoint
3. **Gas Management**: Standard ERC-4337 gas accounting applies
4. **Bundler Support**: Works with standard ERC-4337 bundlers

## Security Considerations

### Access Control
- Only the account owner can configure amount ranges and add levels
- Only EntryPoint can call `execute` and `validateUserOp`
- Only Level contracts can call `onLevelApproved` and `onLevelDenied`
- Only authorized signers can sign or deny at their level

### Reentrancy Protection
- State changes occur before external calls (checks-effects-interactions pattern)
- Storage is cleaned up before execution

### Signature Validation
- ECDSA signature verification for UserOperations
- Owner must sign UserOperations
- Level signatures are tracked on-chain

### Timelock Security
- Timelock starts only after quorum is reached
- Timelock cannot be bypassed
- Anyone can complete timelock after expiry (permissionless)

## Usage Flow

1. **Account Creation**: Deploy via Factory with owner and level signers
2. **Configuration**: Owner configures amount ranges and approval paths
3. **Transaction Proposal**: Owner proposes transaction via ERC-4337 UserOp
4. **Level Approval**: Each level's signers approve sequentially
5. **Timelock**: After quorum, timelock period begins
6. **Progression**: After timelock, transaction moves to next level
7. **Execution**: Once all levels approve, anyone can execute the transaction

## Documentation

- [Architecture Documentation](./ARCHITECTURE.md) - Detailed system architecture
- [API Reference](./API.md) - Complete function and event documentation

## Testing

See the [Testing Guide](../test/TESTING_GUIDE.md) for information on testing contracts.

