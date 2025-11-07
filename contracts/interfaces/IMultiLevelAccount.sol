// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IMultiLevelAccount {
    function onLevelApproved(bytes32 txHash, uint256 levelId) external;
    function onLevelDenied(bytes32 txHash, uint256 levelId, address denier) external;
}

