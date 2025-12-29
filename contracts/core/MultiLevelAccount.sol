// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../interfaces/ILevel.sol";

/**
 * @title MultiLevelAccount
 * @notice ERC-4337 compatible account with multi-level sequential approval
 * @dev Main contract that owns assets and orchestrates approval flow
 */
contract MultiLevelAccount is IAccount, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    
    // ============ Immutables ============
    
    IEntryPoint public immutable entryPoint;
    
    /// @notice Hash of levelSigners configuration to prevent front-running attacks
    bytes32 public immutable levelSignersHash;
    
    // ============ State Variables ============
    
    /// @notice Transaction nonce for uniqueness
    uint256 public nonce;
    
    /// @notice Amount range configurations
    AmountRange[] public amountRanges;
    
    /// @notice Level contract addresses indexed by levelId
    mapping(uint256 => address) public levelContracts;
    
    /// @notice Next level ID
    uint256 public nextLevelId;
    
    /// @notice Whether initialization is complete
    bool public initializationComplete;
    
    /// @notice Transaction data storage
    mapping(bytes32 => Transaction) public transactions;
    
    /// @notice Current level index for each transaction
    mapping(bytes32 => uint256) public currentLevelIndex;
    
    /// @notice Fully approved transactions ready for execution
    mapping(bytes32 => bool) public fullyApproved;
    
    // ============ Structs ============
    
    struct AmountRange {
        uint256 minAmount;      // Minimum amount (inclusive)
        uint256 maxAmount;      // Maximum amount (inclusive)
        uint256[] levelIds;     // Required level IDs
        uint256[] quorums;      // Required quorum per level
        uint256[] timelocks;    // Timelock duration per level (seconds)
    }
    
    struct Transaction {
        address to;             // Destination address
        uint256 value;          // ETH value
        bytes data;             // Call data
        uint256 amount;         // Amount for routing logic
        uint256 proposedAt;     // Timestamp
        AmountRange config;     // Snapshot of config at proposal
    }
    
    // ============ Events ============
    
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
    
    // ============ Errors ============
    
    error OnlyEntryPoint();
    error InvalidSignature();
    error InvalidAmount();
    error NoConfigForAmount();
    error LevelMismatch();
    error NotFullyApproved();
    error TransactionFailed(bytes returnData);
    error InvalidConfiguration();
    error Unauthorized();
    
    // ============ Modifiers ============
    
    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }
    
    modifier onlyLevel(uint256 levelId) {
        if (msg.sender != levelContracts[levelId]) revert Unauthorized();
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        IEntryPoint _entryPoint,
        address _owner,
        bytes32 _levelSignersHash
    ) Ownable(_owner) {
        entryPoint = _entryPoint;
        levelSignersHash = _levelSignersHash;
        nonce = 0;
        nextLevelId = 1;
        initializationComplete = false;
    }
    
    // ============ ERC-4337 Interface ============
    
    /**
     * @notice Validate UserOperation
     * @dev Called by EntryPoint before execution
     * @param userOp The UserOperation to validate
     * @param userOpHash Hash of the UserOperation
     * @param missingAccountFunds Amount needed to pay for gas
     * @return validationData 0 if valid, 1 if invalid
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        // Validate signature (owner must sign)
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address signer = hash.recover(userOp.signature);

        if (signer != owner()) {
            return 1; // SIG_VALIDATION_FAILED
        }

        // Pay prefund if required
        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            require(success, "Prefund failed");
        }

        return 0; // SIG_VALIDATION_SUCCEEDED
    }
    
    /**
     * @notice Execute transaction (Phase 1: Proposal)
     * @dev Called by EntryPoint after validation
     * @param to Destination address
     * @param value ETH value to send
     * @param data Call data
     * @param amount Amount for routing logic (not necessarily == value)
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 amount
    ) external onlyEntryPoint {
        // Generate unique transaction hash
        bytes32 txHash = _generateTxHash(to, value, data, amount);
        
        // Get configuration for this amount
        AmountRange memory config = _getConfigForAmount(amount);
        
        // Store transaction data
        transactions[txHash] = Transaction({
            to: to,
            value: value,
            data: data,
            amount: amount,
            proposedAt: block.timestamp,
            config: config
        });
        
        currentLevelIndex[txHash] = 0;
        
        emit TransactionProposed(
            txHash,
            to,
            value,
            amount,
            config.levelIds,
            config.quorums
        );
        
        // Submit to first level
        ILevel(levelContracts[config.levelIds[0]]).submitTransaction(
            txHash,
            config.quorums[0],
            config.timelocks[0]
        );
    }
    
    // ============ Configuration (Owner Only) ============
    
    /**
     * @notice Configure amount range routing
     * @param minAmount Minimum amount (inclusive)
     * @param maxAmount Maximum amount (inclusive)
     * @param levelIds Level IDs required for this range
     * @param quorums Quorum required at each level
     * @param timelocks Timelock duration at each level (seconds)
     */
    function configureAmountRange(
        uint256 minAmount,
        uint256 maxAmount,
        uint256[] calldata levelIds,
        uint256[] calldata quorums,
        uint256[] calldata timelocks
    ) external onlyOwner {
        if (levelIds.length != quorums.length || 
            levelIds.length != timelocks.length) {
            revert InvalidConfiguration();
        }
        
        if (minAmount > maxAmount) {
            revert InvalidConfiguration();
        }
        
        // Verify all levels exist
        for (uint256 i = 0; i < levelIds.length; i++) {
            if (levelContracts[levelIds[i]] == address(0)) {
                revert InvalidConfiguration();
            }
        }
        
        amountRanges.push(AmountRange({
            minAmount: minAmount,
            maxAmount: maxAmount,
            levelIds: levelIds,
            quorums: quorums,
            timelocks: timelocks
        }));
        
        // Keep sorted by minAmount
        _sortAmountRanges();
        
        emit AmountRangeConfigured(
            amountRanges.length - 1,
            minAmount,
            maxAmount,
            levelIds
        );
    }
    
    /**
     * @notice Add a new level contract
     * @param levelAddress Address of Level contract
     * @return levelId The assigned level ID
     */
    function addLevel(address levelAddress) external onlyOwner returns (uint256 levelId) {
        if (levelAddress == address(0)) revert InvalidConfiguration();
        
        levelId = nextLevelId++;
        
        // Verify the Level's internal levelId matches the assigned levelId
        uint256 levelInternalId = ILevel(levelAddress).levelId();
        if (levelInternalId != levelId) revert InvalidConfiguration();
        
        levelContracts[levelId] = levelAddress;
        
        emit LevelAdded(levelId, levelAddress);
    }
    
    /**
     * @notice Add level during initialization (called by factory)
     * @dev Only callable during account creation before initialization is complete
     * @param levelAddress Address of Level contract
     * @return levelId The assigned level ID
     */
    function addLevelDuringInit(address levelAddress) external returns (uint256 levelId) {
        // Only allow during initialization (before initializationComplete is set to true)
        // This allows factory to set up levels during account creation
        if (levelAddress == address(0)) revert InvalidConfiguration();
        if (initializationComplete) revert Unauthorized();
        
        levelId = nextLevelId++;
        
        // Verify the Level's internal levelId matches the assigned levelId
        uint256 levelInternalId = ILevel(levelAddress).levelId();
        if (levelInternalId != levelId) revert InvalidConfiguration();
        
        levelContracts[levelId] = levelAddress;
        
        emit LevelAdded(levelId, levelAddress);
    }
    
    /**
     * @notice Verify levelSigners configuration matches the hash
     * @dev Called by factory after all levels are added to prevent front-running
     * @param levelSigners Array of signer arrays (one per level)
     */
    function verifyLevelSigners(address[][] calldata levelSigners) external view {
        bytes32 computedHash = keccak256(abi.encode(levelSigners));
        if (computedHash != levelSignersHash) revert InvalidConfiguration();
    }
    
    /**
     * @notice Complete initialization (called by factory after all levels added)
     * @dev Prevents further calls to addLevelDuringInit
     */
    function completeInitialization() external {
        if (initializationComplete) revert Unauthorized();
        // Only allow if called during the same transaction as account creation
        // In practice, factory will call this after adding all levels
        initializationComplete = true;
    }
    
    /**
     * @notice Update existing level contract address
     * @param levelId Level ID to update
     * @param newAddress New Level contract address
     */
    function updateLevel(uint256 levelId, address newAddress) external onlyOwner {
        if (levelContracts[levelId] == address(0)) revert InvalidConfiguration();
        if (newAddress == address(0)) revert InvalidConfiguration();
        
        // Verify the new Level's internal levelId matches the levelId being updated
        uint256 levelInternalId = ILevel(newAddress).levelId();
        if (levelInternalId != levelId) revert InvalidConfiguration();
        
        levelContracts[levelId] = newAddress;
    }
    
    /**
     * @notice Remove amount range configuration
     * @param index Index in amountRanges array
     */
    function removeAmountRange(uint256 index) external onlyOwner {
        if (index >= amountRanges.length) revert InvalidConfiguration();
        
        // Move last element to deleted position
        amountRanges[index] = amountRanges[amountRanges.length - 1];
        amountRanges.pop();
        
        // Re-sort
        _sortAmountRanges();
    }
    
    // ============ Callbacks from Levels ============
    
    /**
     * @notice Called by Level when approval complete
     * @param txHash Transaction hash
     * @param levelId Level that approved
     */
    function onLevelApproved(
        bytes32 txHash,
        uint256 levelId
    ) external onlyLevel(levelId) {
        Transaction memory txn = transactions[txHash];
        
        // Verify this is the expected level
        uint256 currentIdx = currentLevelIndex[txHash];
        if (currentIdx >= txn.config.levelIds.length) {
            revert LevelMismatch();
        }
        if (txn.config.levelIds[currentIdx] != levelId) {
            revert LevelMismatch();
        }
        
        currentLevelIndex[txHash]++;
        
        emit LevelCompleted(txHash, levelId, currentLevelIndex[txHash]);
        
        // Check if more levels required
        if (currentLevelIndex[txHash] < txn.config.levelIds.length) {
            // Submit to next level
            uint256 nextIdx = currentLevelIndex[txHash];
            if (nextIdx >= txn.config.levelIds.length) {
                revert LevelMismatch();
            }
            uint256 nextLevel = txn.config.levelIds[nextIdx];
            
            ILevel(levelContracts[nextLevel]).submitTransaction(
                txHash,
                txn.config.quorums[nextIdx],
                txn.config.timelocks[nextIdx]
            );
        } else {
            // All levels approved - ready for execution
            fullyApproved[txHash] = true;
            emit ReadyForExecution(txHash);
        }
    }
    
    /**
     * @notice Called by Level when transaction denied
     * @param txHash Transaction hash
     * @param levelId Level that denied
     * @param denier Address that denied
     */
    function onLevelDenied(
        bytes32 txHash,
        uint256 levelId,
        address denier
    ) external onlyLevel(levelId) {
        emit TransactionDenied(txHash, levelId, denier);
        
        // Clean up storage
        delete transactions[txHash];
        delete currentLevelIndex[txHash];
        delete fullyApproved[txHash];
    }
    
    // ============ Execution (Permissionless) ============
    
    /**
     * @notice Execute fully approved transaction
     * @dev Anyone can call this once all approvals obtained
     * @param txHash Transaction hash to execute
     */
    function executeApprovedTransaction(bytes32 txHash) external {
        if (!fullyApproved[txHash]) revert NotFullyApproved();
        
        Transaction memory txn = transactions[txHash];
        
        // Clean up storage before execution (checks-effects-interactions)
        delete transactions[txHash];
        delete currentLevelIndex[txHash];
        delete fullyApproved[txHash];
        
        // Execute transaction
        (bool success, bytes memory returnData) = txn.to.call{value: txn.value}(txn.data);
        
        if (!success) {
            revert TransactionFailed(returnData);
        }
        
        emit TransactionExecuted(txHash, txn.to, txn.value);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get transaction details
     * @param txHash Transaction hash
     */
    function getTransaction(bytes32 txHash) external view returns (Transaction memory) {
        return transactions[txHash];
    }
    
    /**
     * @notice Get amount range configuration
     * @param index Index in amountRanges array
     */
    function getAmountRange(uint256 index) external view returns (AmountRange memory) {
        return amountRanges[index];
    }
    
    /**
     * @notice Get number of configured amount ranges
     */
    function getAmountRangeCount() external view returns (uint256) {
        return amountRanges.length;
    }
    
    /**
     * @notice Get required levels for given amount
     * @param amount Transaction amount
     * @return config AmountRange configuration
     */
    function getConfigForAmount(uint256 amount) external view returns (AmountRange memory config) {
        return _getConfigForAmount(amount);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Generate unique transaction hash
     */
    function _generateTxHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 amount
    ) internal returns (bytes32) {
        bytes32 txHash = keccak256(abi.encodePacked(
            address(this),
            to,
            value,
            keccak256(data),
            amount,
            nonce++,
            block.chainid
        ));
        
        return txHash;
    }
    
    /**
     * @dev Get configuration for amount (linear search)
     */
    function _getConfigForAmount(uint256 amount) internal view returns (AmountRange memory) {
        for (uint256 i = 0; i < amountRanges.length; i++) {
            if (amount >= amountRanges[i].minAmount && 
                amount <= amountRanges[i].maxAmount) {
                return amountRanges[i];
            }
        }
        revert NoConfigForAmount();
    }
    
    /**
     * @dev Sort amount ranges by minAmount (bubble sort for small arrays)
     */
    function _sortAmountRanges() internal {
        uint256 n = amountRanges.length;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (amountRanges[i].minAmount > amountRanges[j].minAmount) {
                    AmountRange memory temp = amountRanges[i];
                    amountRanges[i] = amountRanges[j];
                    amountRanges[j] = temp;
                }
            }
        }
    }
    
    // ============ Batch Execution (Stub) ============
    
    /**
     * @notice Batch execution (not implemented in v1)
     */
    function executeBatch(
        address[] calldata /* to */,
        uint256[] calldata /* values */,
        bytes[] calldata /* data */,
        uint256[] calldata /* amounts */
    ) external pure {
        revert("Not implemented");
    }
    
    // ============ Receive ETH ============
    
    receive() external payable {}
}

