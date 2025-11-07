// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ILevel {
    function submitTransaction(
        bytes32 txHash,
        uint256 requiredQuorum,
        uint256 timelockDuration
    ) external;
}

