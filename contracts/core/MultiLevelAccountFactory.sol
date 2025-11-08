// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./MultiLevelAccount.sol";
import "./Level.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

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
    
    error AddressMismatch();
    
    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }
    
    /**
     * @notice Create a new MultiLevelAccount with levels using CREATE2
     * @param owner Account owner
     * @param levelSigners Array of signer arrays (one per level)
     * @param salt Salt for CREATE2 deployment
     * @return account The created MultiLevelAccount
     * @return levels Array of created Level contracts
     */
    function createAccount(
        address owner,
        address[][] calldata levelSigners,
        uint256 salt
    ) external returns (
        MultiLevelAccount account,
        Level[] memory levels
    ) {
        // Prepare initCode for CREATE2 (must match computation in getAddress)
        bytes memory initCode = _getInitCode(owner);
        
        // Compute predicted address first
        address predictedAddress = _computeCreate2Address(initCode, salt);
        
        // Deploy MultiLevelAccount using OpenZeppelin's Create2
        bytes32 saltBytes = bytes32(salt);
        address accountAddress = Create2.deploy(0, saltBytes, initCode);
        
        // Verify the deployed address matches the predicted address
        // This ensures getAddress() returns the correct counterfactual address
        require(accountAddress == predictedAddress, "Address mismatch");
        
        account = MultiLevelAccount(payable(accountAddress));
        
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
    function computeAccountAddress(
        address owner,
        uint256 salt
    ) external view returns (address) {
        bytes memory initCode = _getInitCode(owner);
        return _computeCreate2Address(initCode, salt);
    }

    /**
     * @dev Internal function to compute initCode for CREATE2
     * @param owner Account owner
     * @return initCode The initialization code for MultiLevelAccount deployment
     */
    function _getInitCode(address owner) internal view returns (bytes memory) {
        // For CREATE2, we need the exact initCode that would be used in deployment
        // When using `new Contract(args)`, Solidity does: creationCode + abi.encode(args)
        // The constructor signature is: constructor(IEntryPoint _entryPoint, address _owner)
        bytes memory creationCode = type(MultiLevelAccount).creationCode;
        
        // Encode constructor parameters: (IEntryPoint, address)
        // This must match the exact constructor signature
        bytes memory constructorArgs = abi.encode(entryPoint, owner);
        
        // Combine creationCode and constructor args using bytes.concat (available in Solidity 0.8.4+)
        // This is the most reliable way to concatenate byte arrays
        return bytes.concat(creationCode, constructorArgs);
    }
    
    /**
     * @dev Compute CREATE2 address manually using the standard formula
     * @param initCode The init code for the contract
     * @param salt Salt for CREATE2
     */
    function _computeCreate2Address(
        bytes memory initCode,
        uint256 salt
    ) internal view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            bytes32(salt),
                            keccak256(initCode)
                        )
                    )
                )
            )
        );
    }
}

