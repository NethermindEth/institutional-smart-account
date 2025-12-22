// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../interfaces/IMultiLevelAccount.sol";

/**
 * @title Level
 * @notice Custom multisig with dynamic quorum and timelock
 * @dev One instance per approval level
 */
contract Level {
    
    // ============ Immutables ============
    
    address public immutable multiLevelAccount;
    uint256 public immutable levelId;
    
    // ============ State Variables ============
    
    /// @notice Array of authorized signers
    address[] public signers;
    
    /// @notice Quick lookup for signer authorization
    mapping(address => bool) public isSigner;
    
    /// @notice Approval state per transaction
    mapping(bytes32 => ApprovalState) public approvalStates;
    
    /// @notice Signature tracking
    mapping(bytes32 => mapping(address => bool)) public signatures;
    
    /// @notice Denial tracking
    mapping(bytes32 => mapping(address => bool)) public denials;
    
    // ============ Structs ============
    
    struct ApprovalState {
        bool submitted;          // Whether transaction submitted to this level
        uint256 requiredQuorum;  // Required signatures (from MultiLevelAccount)
        uint256 signatureCount;  // Current signature count
        uint256 timelockDuration;// Timelock duration (seconds)
        uint256 timelockEnd;     // When timelock expires (0 if not started)
        bool approved;           // Whether approved and sent to MLA
        bool denied;             // Whether denied
    }
    
    // ============ Events ============
    
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
    
    // ============ Errors ============
    
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
    
    // ============ Modifiers ============
    
    modifier onlyMultiLevelAccount() {
        if (msg.sender != multiLevelAccount) revert NotAuthorized();
        _;
    }
    
    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        address _multiLevelAccount,
        uint256 _levelId,
        address[] memory _signers
    ) {
        if (_multiLevelAccount == address(0)) revert InvalidSigner();
        if (_signers.length == 0) revert InvalidSigner();
        
        multiLevelAccount = _multiLevelAccount;
        levelId = _levelId;
        
        // Initialize signers
        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert InvalidSigner();
            // Allow duplicates for demo purposes (same address can be used multiple times)
            // Note: Duplicates are still added to the signers array for quorum counting
            if (!isSigner[_signers[i]]) {
                isSigner[_signers[i]] = true;
                emit SignerAdded(_signers[i]);
            }
            
            signers.push(_signers[i]);
        }
    }
    
    // ============ Transaction Submission ============
    
    /**
     * @notice Submit transaction to this level
     * @dev Called by MultiLevelAccount
     * @param txHash Transaction hash
     * @param requiredQuorum Required signatures
     * @param timelockDuration Timelock duration in seconds
     */
    function submitTransaction(
        bytes32 txHash,
        uint256 requiredQuorum,
        uint256 timelockDuration
    ) external onlyMultiLevelAccount {
        if (approvalStates[txHash].submitted) revert AlreadyApproved();
        if (requiredQuorum == 0 || requiredQuorum > signers.length) {
            revert NotAuthorized();
        }
        
        approvalStates[txHash] = ApprovalState({
            submitted: true,
            requiredQuorum: requiredQuorum,
            signatureCount: 0,
            timelockDuration: timelockDuration,
            timelockEnd: 0,
            approved: false,
            denied: false
        });
        
        emit TransactionSubmitted(txHash, requiredQuorum, timelockDuration);
    }
    
    // ============ Signing Functions ============
    
    /**
     * @notice Sign (approve) a transaction
     * @param txHash Transaction hash
     */
    function sign(bytes32 txHash) external onlySigner {
        ApprovalState storage state = approvalStates[txHash];
        
        if (!state.submitted) revert NotSubmitted();
        if (state.denied) revert TransactionDenied();
        if (state.approved) revert AlreadyApproved();
        if (signatures[txHash][msg.sender]) revert AlreadySigned();
        
        signatures[txHash][msg.sender] = true;
        state.signatureCount++;
        
        emit Signed(
            txHash,
            msg.sender,
            state.signatureCount,
            state.requiredQuorum
        );
        
        // Check if quorum reached
        if (state.signatureCount >= state.requiredQuorum) {
            _handleQuorumReached(txHash);
        }
    }
    
    /**
     * @notice Deny a transaction (veto)
     * @param txHash Transaction hash
     */
    function deny(bytes32 txHash) external onlySigner {
        ApprovalState storage state = approvalStates[txHash];
        
        if (!state.submitted) revert NotSubmitted();
        if (state.denied) revert AlreadyDenied();
        if (state.approved) revert AlreadyApproved();
        
        denials[txHash][msg.sender] = true;
        state.denied = true;
        
        emit Denied(txHash, msg.sender);
        
        // Notify MultiLevelAccount immediately
        IMultiLevelAccount(multiLevelAccount).onLevelDenied(
            txHash,
            levelId,
            msg.sender
        );
    }
    
    /**
     * @notice Complete timelock and notify MultiLevelAccount
     * @dev Permissionless - anyone can call after timelock expires
     * @param txHash Transaction hash
     */
    function completeTimelock(bytes32 txHash) external {
        ApprovalState storage state = approvalStates[txHash];
        
        if (!state.submitted) revert NotSubmitted();
        if (state.denied) revert TransactionDenied();
        if (state.approved) revert AlreadyApproved();
        if (state.signatureCount < state.requiredQuorum) revert QuorumNotReached();
        if (state.timelockEnd == 0 || block.timestamp < state.timelockEnd) {
            revert TimelockActive();
        }
        
        state.approved = true;
        
        emit LevelApproved(txHash);
        
        // Notify MultiLevelAccount
        IMultiLevelAccount(multiLevelAccount).onLevelApproved(txHash, levelId);
    }
    
    // ============ Signer Management ============
    
    /**
     * @notice Add a new signer
     * @dev Can only be called by MultiLevelAccount owner
     * @param signer Address to add
     */
    function addSigner(address signer) external onlyMultiLevelAccount {
        if (signer == address(0)) revert InvalidSigner();
        if (isSigner[signer]) revert InvalidSigner();
        
        signers.push(signer);
        isSigner[signer] = true;
        
        emit SignerAdded(signer);
    }
    
    /**
     * @notice Remove a signer
     * @dev Can only be called by MultiLevelAccount owner
     * @param signer Address to remove
     */
    function removeSigner(address signer) external onlyMultiLevelAccount {
        if (!isSigner[signer]) revert InvalidSigner();
        if (signers.length <= 1) revert InvalidSigner(); // Must have at least 1
        
        isSigner[signer] = false;
        
        // Remove from array
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }
        
        emit SignerRemoved(signer);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get all signers
     */
    function getSigners() external view returns (address[] memory) {
        return signers;
    }
    
    /**
     * @notice Get signer count
     */
    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }
    
    /**
     * @notice Check if address has signed
     * @param txHash Transaction hash
     * @param signer Signer address
     */
    function hasSigned(bytes32 txHash, address signer) external view returns (bool) {
        return signatures[txHash][signer];
    }
    
    /**
     * @notice Check if address has denied
     * @param txHash Transaction hash
     * @param signer Signer address
     */
    function hasDenied(bytes32 txHash, address signer) external view returns (bool) {
        return denials[txHash][signer];
    }
    
    /**
     * @notice Get approval state
     * @param txHash Transaction hash
     */
    function getApprovalState(bytes32 txHash) external view returns (ApprovalState memory) {
        return approvalStates[txHash];
    }
    
    /**
     * @notice Get signature progress
     * @param txHash Transaction hash
     */
    function getSignatureProgress(bytes32 txHash) 
        external 
        view 
        returns (uint256 current, uint256 required) 
    {
        ApprovalState memory state = approvalStates[txHash];
        return (state.signatureCount, state.requiredQuorum);
    }
    
    /**
     * @notice Get timelock remaining
     * @param txHash Transaction hash
     * @return seconds remaining (0 if expired or not started)
     */
    function getTimelockRemaining(bytes32 txHash) external view returns (uint256) {
        ApprovalState memory state = approvalStates[txHash];
        
        // Return 0 if transaction not submitted
        if (!state.submitted) {
            return 0;
        }
        
        // Check if timelock has been started (quorum reached)
        // timelockEnd will be > 0 only after quorum is reached
        // Use comparison with block.timestamp to avoid strict equality check
        if (state.timelockEnd <= block.timestamp) {
            return 0;
        }
        
        // Safe subtraction: we know timelockEnd > block.timestamp at this point
        return state.timelockEnd - block.timestamp;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Handle quorum reached - start timelock
     * @dev Only starts timelock once - additional signatures after quorum do not reset it
     */
    function _handleQuorumReached(bytes32 txHash) internal {
        ApprovalState storage state = approvalStates[txHash];
        
        if (state.timelockDuration > 0) {
            // Only start timelock if it hasn't been started yet
            // This prevents griefing attacks where additional signers reset the timelock
            if (state.timelockEnd == 0) {
                state.timelockEnd = block.timestamp + state.timelockDuration;
                emit QuorumReached(txHash, state.timelockEnd);
            }
        } else {
            // No timelock - approve immediately (only once)
            if (!state.approved) {
                state.approved = true;
                emit LevelApproved(txHash);
                
                IMultiLevelAccount(multiLevelAccount).onLevelApproved(txHash, levelId);
            }
        }
    }
}

