// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract MaliciousReentrancy {
    address public target;
    
    constructor(address _target) {
        target = _target;
    }
    
    function attack() external {
        // Try to re-enter
        // This would fail if reentrancy protection is in place
    }
    
    receive() external payable {
        // Reentrancy attempt
    }
}

