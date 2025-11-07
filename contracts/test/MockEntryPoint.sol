// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/INonceManager.sol";
import "@account-abstraction/contracts/interfaces/ISenderCreator.sol";

/**
 * @title MockEntryPoint
 * @notice Simplified EntryPoint for testing
 * @dev This is a minimal implementation for testing purposes only
 */
contract MockEntryPoint is IEntryPoint {
    mapping(address => uint256) public balances;
    
    function handleOps(
        PackedUserOperation[] calldata ops,
        address payable beneficiary
    ) external override {
        // Simplified implementation for testing
        for (uint256 i = 0; i < ops.length; i++) {
            PackedUserOperation calldata op = ops[i];
            
            // Validate user op
            bytes32 userOpHash = getUserOpHash(op);
            uint256 validationData = IAccount(op.sender).validateUserOp(
                op,
                userOpHash,
                0
            );
            
            require(validationData == 0, "Validation failed");
            
            // Execute the call
            (bool success, ) = op.sender.call(op.callData);
            require(success, "Execution failed");
        }
    }
    
    function getUserOpHash(
        PackedUserOperation calldata userOp
    ) public view override returns (bytes32) {
        // Simplified hash for testing - uses packed fields directly
        return keccak256(abi.encodePacked(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.accountGasLimits,
            userOp.preVerificationGas,
            userOp.gasFees,
            keccak256(userOp.paymasterAndData),
            address(this),
            block.chainid
        ));
    }
    
    // Stub implementations for interface compliance
    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata,
        address payable
    ) external pure override {
        revert("Not implemented");
    }
    
    function depositTo(address) external payable override {
        // Accept deposits
        balances[msg.sender] += msg.value;
    }
    
    function addStake(uint32) external payable override {
        // Accept stake
    }
    
    function unlockStake() external override {
        // Unlock stake
    }
    
    function withdrawStake(address payable) external override {
        // Withdraw stake
    }
    
    function withdrawTo(address payable, uint256) external override {
        // Withdraw
    }
    
    function getDeposit(address account) external view returns (uint256) {
        return balances[account];
    }
    
    function getDepositInfo(address account) external view override returns (DepositInfo memory) {
        return DepositInfo({
            deposit: balances[account],
            staked: false,
            stake: 0,
            unstakeDelaySec: 0,
            withdrawTime: 0
        });
    }
    
    function balanceOf(address account) external view override returns (uint256) {
        return balances[account];
    }
    
    // INonceManager implementation
    function getNonce(address sender, uint192 key) external view override returns (uint256) {
        return 0; // Simplified for testing
    }
    
    function incrementNonce(uint192 key) external override {
        // Simplified for testing
    }
    
    // IEntryPoint additional methods
    function senderCreator() external view override returns (ISenderCreator) {
        return ISenderCreator(address(0)); // Simplified for testing
    }
    
    function getSenderAddress(bytes memory) external pure override {
        // This method always reverts with SenderAddressResult
        revert("SenderAddressResult(address(0))");
    }
    
    function delegateAndRevert(address, bytes calldata) external pure override {
        // This method always reverts
        revert("Not implemented");
    }
    
    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}

