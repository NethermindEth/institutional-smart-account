// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./MultiLevelAccount.sol";
import "./Level.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * @title MultiLevelAccountFactory
 * @notice Factory for deploying MultiLevelAccount and Level contracts
 */
contract MultiLevelAccountFactory {
    
    IEntryPoint public immutable entryPoint;
    
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
    
    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }
    
    /**
     * @notice Create a new MultiLevelAccount with levels
     * @param owner Account owner
     * @param levelSigners Array of signer arrays (one per level)
     * @return account The created MultiLevelAccount
     * @return levels Array of created Level contracts
     */
    function createAccount(
        address owner,
        address[][] calldata levelSigners
    ) external returns (
        MultiLevelAccount account,
        Level[] memory levels
    ) {
        // Deploy MultiLevelAccount
        account = new MultiLevelAccount(entryPoint, owner);
        
        // Deploy levels
        levels = new Level[](levelSigners.length);
        uint256[] memory levelIds = new uint256[](levelSigners.length);
        
        for (uint256 i = 0; i < levelSigners.length; i++) {
            levels[i] = new Level(
                address(account),
                i + 1, // levelId starts at 1
                levelSigners[i]
            );
            
            // Use addLevelDuringInit for initial setup
            levelIds[i] = account.addLevelDuringInit(address(levels[i]));
            
            emit LevelCreated(address(levels[i]), levelIds[i], levelSigners[i]);
        }
        
        // Complete initialization to prevent further addLevelDuringInit calls
        account.completeInitialization();
        
        emit AccountCreated(address(account), owner, levelIds);
    }
    
    /**
     * @notice Compute the counterfactual address of an account
     * @param owner Account owner
     * @param salt Salt for CREATE2
     */
    function getAddress(
        address owner,
        uint256 salt
    ) external view returns (address) {
        // For CREATE2, we need the exact initCode that would be used in deployment
        // When using `new Contract(args)`, Solidity does: creationCode + abi.encode(args)
        // The constructor signature is: constructor(IEntryPoint _entryPoint, address _owner)
        bytes memory creationCode = type(MultiLevelAccount).creationCode;
        
        // Encode constructor parameters: (IEntryPoint, address)
        // This must match the exact constructor signature
        bytes memory constructorArgs = abi.encode(entryPoint, owner);
        
        // Combine creationCode and constructor args using bytes.concat (available in Solidity 0.8.4+)
        // This is the most reliable way to concatenate byte arrays
        bytes memory initCode = bytes.concat(creationCode, constructorArgs);
        
        // CREATE2 formula: keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))
        bytes32 saltBytes = bytes32(salt);
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                saltBytes,
                keccak256(initCode)
            )
        );
        
        return address(uint160(uint256(hash)));
    }
}

