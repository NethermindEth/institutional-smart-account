# Contract API Reference

Complete API reference for all contracts in the Multi-Level Sequential Approval System.

## MultiLevelAccount

Main account contract implementing ERC-4337 IAccount interface.

### State Variables

#### Public View Functions

```solidity
IEntryPoint public immutable entryPoint;
uint256 public nonce;
AmountRange[] public amountRanges;
mapping(uint256 => address) public levelContracts;
uint256 public nextLevelId;
bool public initializationComplete;
mapping(bytes32 => Transaction) public transactions;
mapping(bytes32 => uint256) public currentLevelIndex;
mapping(bytes32 => bool) public fullyApproved;
```

### Functions

#### ERC-4337 Interface

##### `validateUserOp`

```solidity
function validateUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external override onlyEntryPoint returns (uint256 validationData)
```

Validates a UserOperation. Called by EntryPoint before execution.

**Parameters:**
- `userOp` - The UserOperation to validate
- `userOpHash` - Hash of the UserOperation
- `missingAccountFunds` - Amount needed to pay for gas

**Returns:**
- `validationData` - 0 if valid, 1 if invalid

**Access:** Only EntryPoint

**Reverts:**
- If signature is invalid (returns 1 instead of reverting)

#### Transaction Execution

##### `execute`

```solidity
function execute(
    address to,
    uint256 value,
    bytes calldata data,
    uint256 amount
) external onlyEntryPoint
```

Propose a transaction. Called by EntryPoint after validation.

**Parameters:**
- `to` - Destination address
- `value` - ETH value to send
- `data` - Call data
- `amount` - Amount for routing logic (may differ from value)

**Access:** Only EntryPoint

**Emits:** `TransactionProposed`

**Reverts:**
- `NoConfigForAmount()` - No amount range configured for this amount

##### `executeApprovedTransaction`

```solidity
function executeApprovedTransaction(bytes32 txHash) external
```

Execute a fully approved transaction. Anyone can call this.

**Parameters:**
- `txHash` - Transaction hash to execute

**Access:** Public (permissionless)

**Emits:** `TransactionExecuted`

**Reverts:**
- `NotFullyApproved()` - Transaction not fully approved
- `TransactionFailed(bytes)` - Transaction execution failed

#### Configuration (Owner Only)

##### `configureAmountRange`

```solidity
function configureAmountRange(
    uint256 minAmount,
    uint256 maxAmount,
    uint256[] calldata levelIds,
    uint256[] calldata quorums,
    uint256[] calldata timelocks
) external onlyOwner
```

Configure amount range routing.

**Parameters:**
- `minAmount` - Minimum amount (inclusive)
- `maxAmount` - Maximum amount (inclusive)
- `levelIds` - Level IDs required for this range
- `quorums` - Quorum required at each level
- `timelocks` - Timelock duration at each level (seconds)

**Access:** Only Owner

**Emits:** `AmountRangeConfigured`

**Reverts:**
- `InvalidConfiguration()` - Invalid parameters or level doesn't exist

##### `addLevel`

```solidity
function addLevel(address levelAddress) external onlyOwner returns (uint256 levelId)
```

Add a new level contract.

**Parameters:**
- `levelAddress` - Address of Level contract

**Returns:**
- `levelId` - The assigned level ID

**Access:** Only Owner

**Emits:** `LevelAdded`

**Reverts:**
- `InvalidConfiguration()` - Invalid level address

##### `addLevelDuringInit`

```solidity
function addLevelDuringInit(address levelAddress) external returns (uint256 levelId)
```

Add level during initialization (called by factory).

**Parameters:**
- `levelAddress` - Address of Level contract

**Returns:**
- `levelId` - The assigned level ID

**Access:** Public (only during initialization)

**Emits:** `LevelAdded`

**Reverts:**
- `InvalidConfiguration()` - Invalid level address
- `Unauthorized()` - Initialization already complete

##### `completeInitialization`

```solidity
function completeInitialization() external
```

Complete initialization (called by factory).

**Access:** Public (only before initialization complete)

**Reverts:**
- `Unauthorized()` - Already initialized

##### `updateLevel`

```solidity
function updateLevel(uint256 levelId, address newAddress) external onlyOwner
```

Update existing level contract address.

**Parameters:**
- `levelId` - Level ID to update
- `newAddress` - New Level contract address

**Access:** Only Owner

**Reverts:**
- `InvalidConfiguration()` - Level doesn't exist or invalid address

##### `removeAmountRange`

```solidity
function removeAmountRange(uint256 index) external onlyOwner
```

Remove amount range configuration.

**Parameters:**
- `index` - Index in amountRanges array

**Access:** Only Owner

**Reverts:**
- `InvalidConfiguration()` - Index out of bounds

#### Callbacks from Levels

##### `onLevelApproved`

```solidity
function onLevelApproved(
    bytes32 txHash,
    uint256 levelId
) external onlyLevel(levelId)
```

Called by Level when approval complete.

**Parameters:**
- `txHash` - Transaction hash
- `levelId` - Level that approved

**Access:** Only Level contract

**Emits:** `LevelCompleted`, `ReadyForExecution` (if all levels done)

**Reverts:**
- `LevelMismatch()` - Unexpected level or index out of bounds

##### `onLevelDenied`

```solidity
function onLevelDenied(
    bytes32 txHash,
    uint256 levelId,
    address denier
) external onlyLevel(levelId)
```

Called by Level when transaction denied.

**Parameters:**
- `txHash` - Transaction hash
- `levelId` - Level that denied
- `denier` - Address that denied

**Access:** Only Level contract

**Emits:** `TransactionDenied`

#### View Functions

##### `getTransaction`

```solidity
function getTransaction(bytes32 txHash) external view returns (Transaction memory)
```

Get transaction details.

**Parameters:**
- `txHash` - Transaction hash

**Returns:** Transaction struct

##### `getAmountRange`

```solidity
function getAmountRange(uint256 index) external view returns (AmountRange memory)
```

Get amount range configuration.

**Parameters:**
- `index` - Index in amountRanges array

**Returns:** AmountRange struct

##### `getAmountRangeCount`

```solidity
function getAmountRangeCount() external view returns (uint256)
```

Get number of configured amount ranges.

**Returns:** Number of ranges

##### `getConfigForAmount`

```solidity
function getConfigForAmount(uint256 amount) external view returns (AmountRange memory config)
```

Get required levels for given amount.

**Parameters:**
- `amount` - Transaction amount

**Returns:** AmountRange configuration

**Reverts:**
- `NoConfigForAmount()` - No range configured for this amount

### Events

```solidity
event TransactionProposed(
    bytes32 indexed txHash,
    address indexed to,
    uint256 value,
    uint256 amount,
    uint256[] levelIds,
    uint256[] quorums
);

event LevelCompleted(
    bytes32 indexed txHash,
    uint256 indexed levelId,
    uint256 currentIndex
);

event ReadyForExecution(
    bytes32 indexed txHash
);

event TransactionExecuted(
    bytes32 indexed txHash,
    address indexed to,
    uint256 value
);

event TransactionDenied(
    bytes32 indexed txHash,
    uint256 indexed levelId,
    address indexed denier
);

event AmountRangeConfigured(
    uint256 indexed index,
    uint256 minAmount,
    uint256 maxAmount,
    uint256[] levelIds
);

event LevelAdded(
    uint256 indexed levelId,
    address indexed levelAddress
);
```

### Errors

```solidity
error OnlyEntryPoint();
error InvalidSignature();
error InvalidAmount();
error NoConfigForAmount();
error LevelMismatch();
error NotFullyApproved();
error TransactionFailed(bytes returnData);
error InvalidConfiguration();
error Unauthorized();
```

## Level

Individual approval level contract.

### State Variables

#### Public View Functions

```solidity
address public immutable multiLevelAccount;
uint256 public immutable levelId;
address[] public signers;
mapping(address => bool) public isSigner;
mapping(bytes32 => ApprovalState) public approvalStates;
mapping(bytes32 => mapping(address => bool)) public signatures;
mapping(bytes32 => mapping(address => bool)) public denials;
```

### Functions

#### Transaction Submission

##### `submitTransaction`

```solidity
function submitTransaction(
    bytes32 txHash,
    uint256 requiredQuorum,
    uint256 timelockDuration
) external onlyMultiLevelAccount
```

Submit transaction to this level. Called by MultiLevelAccount.

**Parameters:**
- `txHash` - Transaction hash
- `requiredQuorum` - Required signatures
- `timelockDuration` - Timelock duration in seconds

**Access:** Only MultiLevelAccount

**Emits:** `TransactionSubmitted`

**Reverts:**
- `AlreadyApproved()` - Transaction already submitted
- `NotAuthorized()` - Invalid quorum or not called by account

#### Signing Functions

##### `sign`

```solidity
function sign(bytes32 txHash) external onlySigner
```

Sign (approve) a transaction.

**Parameters:**
- `txHash` - Transaction hash

**Access:** Only Signer

**Emits:** `Signed`, `QuorumReached` (if quorum reached), `LevelApproved` (if no timelock)

**Reverts:**
- `NotSubmitted()` - Transaction not submitted to this level
- `TransactionDenied()` - Transaction already denied
- `AlreadyApproved()` - Transaction already approved
- `AlreadySigned()` - Signer already signed

##### `deny`

```solidity
function deny(bytes32 txHash) external onlySigner
```

Deny (veto) a transaction.

**Parameters:**
- `txHash` - Transaction hash

**Access:** Only Signer

**Emits:** `Denied`

**Reverts:**
- `NotSubmitted()` - Transaction not submitted
- `AlreadyDenied()` - Already denied
- `AlreadyApproved()` - Already approved

##### `completeTimelock`

```solidity
function completeTimelock(bytes32 txHash) external
```

Complete timelock and notify MultiLevelAccount. Permissionless - anyone can call after timelock expires.

**Parameters:**
- `txHash` - Transaction hash

**Access:** Public (permissionless)

**Emits:** `LevelApproved`

**Reverts:**
- `NotSubmitted()` - Transaction not submitted
- `TransactionDenied()` - Transaction denied
- `AlreadyApproved()` - Already approved
- `QuorumNotReached()` - Quorum not reached
- `TimelockActive()` - Timelock not expired

#### Signer Management

##### `addSigner`

```solidity
function addSigner(address signer) external onlyMultiLevelAccount
```

Add a new signer.

**Parameters:**
- `signer` - Address to add

**Access:** Only MultiLevelAccount

**Emits:** `SignerAdded`

**Reverts:**
- `InvalidSigner()` - Invalid address or already a signer

##### `removeSigner`

```solidity
function removeSigner(address signer) external onlyMultiLevelAccount
```

Remove a signer.

**Parameters:**
- `signer` - Address to remove

**Access:** Only MultiLevelAccount

**Emits:** `SignerRemoved`

**Reverts:**
- `InvalidSigner()` - Not a signer or would leave level empty

#### View Functions

##### `getSigners`

```solidity
function getSigners() external view returns (address[] memory)
```

Get all signers.

**Returns:** Array of signer addresses

##### `getSignerCount`

```solidity
function getSignerCount() external view returns (uint256)
```

Get signer count.

**Returns:** Number of signers

##### `hasSigned`

```solidity
function hasSigned(bytes32 txHash, address signer) external view returns (bool)
```

Check if address has signed.

**Parameters:**
- `txHash` - Transaction hash
- `signer` - Signer address

**Returns:** True if signed

##### `hasDenied`

```solidity
function hasDenied(bytes32 txHash, address signer) external view returns (bool)
```

Check if address has denied.

**Parameters:**
- `txHash` - Transaction hash
- `signer` - Signer address

**Returns:** True if denied

##### `getApprovalState`

```solidity
function getApprovalState(bytes32 txHash) external view returns (ApprovalState memory)
```

Get approval state.

**Parameters:**
- `txHash` - Transaction hash

**Returns:** ApprovalState struct

##### `getSignatureProgress`

```solidity
function getSignatureProgress(bytes32 txHash) 
    external 
    view 
    returns (uint256 current, uint256 required)
```

Get signature progress.

**Parameters:**
- `txHash` - Transaction hash

**Returns:**
- `current` - Current signature count
- `required` - Required quorum

##### `getTimelockRemaining`

```solidity
function getTimelockRemaining(bytes32 txHash) external view returns (uint256)
```

Get timelock remaining.

**Parameters:**
- `txHash` - Transaction hash

**Returns:** Seconds remaining (0 if expired or not started)

### Events

```solidity
event TransactionSubmitted(
    bytes32 indexed txHash,
    uint256 requiredQuorum,
    uint256 timelockDuration
);

event Signed(
    bytes32 indexed txHash,
    address indexed signer,
    uint256 signatureCount,
    uint256 requiredQuorum
);

event QuorumReached(
    bytes32 indexed txHash,
    uint256 timelockEnd
);

event Denied(
    bytes32 indexed txHash,
    address indexed denier
);

event LevelApproved(
    bytes32 indexed txHash
);

event SignerAdded(address indexed signer);
event SignerRemoved(address indexed signer);
```

### Errors

```solidity
error NotAuthorized();
error NotSigner();
error NotSubmitted();
error AlreadySigned();
error AlreadyDenied();
error TransactionDenied();
error QuorumNotReached();
error TimelockActive();
error AlreadyApproved();
error InvalidSigner();
```

## MultiLevelAccountFactory

Factory for deploying MultiLevelAccount instances.

### State Variables

```solidity
IEntryPoint public immutable entryPoint;
```

### Functions

##### `createAccount`

```solidity
function createAccount(
    address owner,
    address[][] calldata levelSigners
) external returns (
    MultiLevelAccount account,
    Level[] memory levels
)
```

Create a new MultiLevelAccount with levels.

**Parameters:**
- `owner` - Account owner
- `levelSigners` - Array of signer arrays (one per level)

**Returns:**
- `account` - The created MultiLevelAccount
- `levels` - Array of created Level contracts

**Access:** Public

**Emits:** `AccountCreated`, `LevelCreated` (for each level)

##### `computeAccountAddress`

```solidity
function computeAccountAddress(
    address owner,
    uint256 salt
) external view returns (address)
```

Compute the counterfactual address of an account (CREATE2).

**Parameters:**
- `owner` - Account owner
- `salt` - Salt for CREATE2

**Returns:** Counterfactual address

### Events

```solidity
event AccountCreated(
    address indexed account,
    address indexed owner,
    uint256[] levelIds
);

event LevelCreated(
    address indexed level,
    uint256 indexed levelId,
    address[] signers
);
```

## Data Types

### AmountRange

```solidity
struct AmountRange {
    uint256 minAmount;      // Minimum amount (inclusive)
    uint256 maxAmount;      // Maximum amount (inclusive)
    uint256[] levelIds;     // Required level IDs
    uint256[] quorums;      // Required quorum per level
    uint256[] timelocks;    // Timelock duration per level (seconds)
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
    AmountRange config;     // Snapshot of config at proposal
}
```

### ApprovalState

```solidity
struct ApprovalState {
    bool submitted;          // Whether transaction submitted
    uint256 requiredQuorum;  // Required signatures
    uint256 signatureCount;  // Current signature count
    uint256 timelockDuration;// Timelock duration (seconds)
    uint256 timelockEnd;     // When timelock expires (0 if not started)
    bool approved;           // Whether approved
    bool denied;             // Whether denied
}
```

