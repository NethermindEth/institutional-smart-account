// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title RevertingContract
 * @notice Simple contract that reverts on receive for testing transaction failures
 */
contract RevertingContract {
    receive() external payable {
        revert("Transaction failed");
    }
    
    fallback() external payable {
        revert("Transaction failed");
    }
}

