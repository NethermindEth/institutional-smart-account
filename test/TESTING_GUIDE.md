# Testing Guide

Complete guide to writing and running tests for the Multi-Level Sequential Approval System.

## Table of Contents

1. [Test Structure](#test-structure)
2. [Writing Unit Tests](#writing-unit-tests)
3. [Writing Integration Tests](#writing-integration-tests)
4. [Writing Security Tests](#writing-security-tests)
5. [Writing ERC-4337 Tests](#writing-erc-4337-tests)
6. [Using Test Fixtures](#using-test-fixtures)
7. [Mock Contracts](#mock-contracts)
8. [Code Coverage](#code-coverage)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Test Structure

Tests are organized by category:

- **Unit Tests**: Test individual contracts in isolation
- **Integration Tests**: Test complete workflows
- **Security Tests**: Test security properties
- **ERC-4337 Tests**: Test ERC-4337 compatibility
- **SDK Tests**: Test TypeScript SDK

## Writing Unit Tests

### Basic Unit Test Structure

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiLevelAccount, Level } from "../../typechain-types";
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("MultiLevelAccount - Unit Tests", () => {
  let fixture: DeployFixture;
  let account: MultiLevelAccount;
  let owner: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    account = fixture.account;
    owner = fixture.owner;
  });

  describe("Configuration Management", () => {
    it("Should add a new level", async () => {
      // Test implementation
    });
  });
});
```

### Testing Functions

```typescript
it("Should configure amount range", async () => {
  await account.connect(owner).configureAmountRange(
    0,
    ethers.parseEther("10000"),
    [1],
    [2],
    [3600]
  );

  const range = await account.getAmountRange(0);
  expect(range.minAmount).to.equal(0);
  expect(range.maxAmount).to.equal(ethers.parseEther("10000"));
});
```

### Testing Events

```typescript
it("Should emit TransactionProposed event", async () => {
  // Execute transaction
  const tx = await entryPoint.handleOps([userOp], beneficiary);
  const receipt = await tx.wait();

  // Find event
  const event = receipt.logs
    .map((log) => {
      try {
        return account.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "TransactionProposed");

  expect(event).to.not.be.null;
  expect(event!.args.txHash).to.equal(expectedTxHash);
});
```

### Testing Reverts

```typescript
it("Should revert if not owner", async () => {
  await expect(
    account.connect(nonOwner).configureAmountRange(...)
  ).to.be.revertedWith("OwnableUnauthorizedAccount");
});
```

### Testing State Changes

```typescript
it("Should update current level index", async () => {
  const initialIndex = await account.currentLevelIndex(txHash);
  
  // Complete level approval
  await level1.completeTimelock(txHash);
  
  const newIndex = await account.currentLevelIndex(txHash);
  expect(newIndex).to.equal(initialIndex + 1n);
});
```

## Writing Integration Tests

### Full Flow Test

```typescript
describe("Full Flow - Integration Tests", () => {
  it("Should complete 3-level approval flow", async () => {
    // 1. Propose transaction
    const txHash = await proposeTransaction(...);

    // 2. Level 1 approval
    await level1.connect(ops1).sign(txHash);
    await level1.connect(ops2).sign(txHash);
    await level1.completeTimelock(txHash);

    // 3. Level 2 approval
    await level2.connect(comp1).sign(txHash);
    await level2.connect(comp2).sign(txHash);
    await level2.completeTimelock(txHash);

    // 4. Level 3 approval
    await level3.connect(exec).sign(txHash);
    await level3.completeTimelock(txHash);

    // 5. Execute
    await account.executeApprovedTransaction(txHash);
  });
});
```

### Testing Concurrent Transactions

```typescript
it("Should handle concurrent transactions", async () => {
  const tx1 = await proposeTransaction(...);
  const tx2 = await proposeTransaction(...);

  // Approve both in parallel
  await Promise.all([
    approveTransaction(level1, tx1),
    approveTransaction(level1, tx2),
  ]);

  // Both should progress independently
  const status1 = await account.getTransaction(tx1);
  const status2 = await account.getTransaction(tx2);
  
  expect(status1).to.not.be.null;
  expect(status2).to.not.be.null;
});
```

## Writing Security Tests

### Reentrancy Tests

```typescript
describe("Reentrancy Protection", () => {
  it("Should prevent reentrancy attacks", async () => {
    const malicious = await ethers.deployContract("MaliciousReentrancy", [
      account.address,
    ]);

    // Attempt reentrancy attack
    await expect(
      malicious.attack()
    ).to.be.reverted;
  });
});
```

### Access Control Tests

```typescript
describe("Access Control", () => {
  it("Should only allow owner to configure", async () => {
    await expect(
      account.connect(nonOwner).configureAmountRange(...)
    ).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("Should only allow EntryPoint to execute", async () => {
    await expect(
      account.connect(owner).execute(...)
    ).to.be.revertedWith("OnlyEntryPoint");
  });
});
```

### Signature Replay Tests

```typescript
describe("Signature Replay", () => {
  it("Should prevent signature replay across chains", async () => {
    const userOp = await createUserOp(...);
    const signedOp = await signUserOp(userOp, owner);

    // Use on different chain
    await expect(
      entryPoint.handleOps([signedOp], beneficiary)
    ).to.be.reverted; // Should fail due to chainId mismatch
  });
});
```

## Writing ERC-4337 Tests

### UserOperation Validation

```typescript
describe("UserOperation Validation", () => {
  it("Should validate UserOperation signature", async () => {
    const userOp = await createUserOp(...);
    const signedOp = await signUserOp(userOp, owner);

    const userOpHash = await entryPoint.getUserOpHash(signedOp);
    const validationData = await account.validateUserOp.staticCall(
      signedOp,
      userOpHash,
      0
    );

    expect(validationData).to.equal(0); // SIG_VALIDATION_SUCCEEDED
  });
});
```

### EntryPoint Integration

```typescript
describe("EntryPoint Integration", () => {
  it("Should handle UserOperation via EntryPoint", async () => {
    const userOp = await createUserOp(...);
    const signedOp = await signUserOp(userOp, owner);

    const tx = await entryPoint.handleOps([signedOp], beneficiary);
    const receipt = await tx.wait();

    expect(receipt.status).to.equal(1);
  });
});
```

## Using Test Fixtures

### Using deployFixture

```typescript
import { deployFixture, DeployFixture } from "../helpers/fixtures";

describe("My Test Suite", () => {
  let fixture: DeployFixture;

  beforeEach(async () => {
    fixture = await deployFixture();
  });

  it("Should use fixture", async () => {
    const { account, level1, owner } = fixture;
    // Use deployed contracts
  });
});
```

### Custom Fixtures

```typescript
async function customFixture() {
  const fixture = await deployFixture();
  
  // Additional setup
  await fixture.account.connect(fixture.owner).configureAmountRange(...);
  
  return {
    ...fixture,
    customValue: "something",
  };
}
```

## Mock Contracts

### MockEntryPoint

Located in `contracts/test/MockEntryPoint.sol`, provides a simplified EntryPoint for testing.

```typescript
const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
const entryPoint = await EntryPointFactory.deploy();
```

### Using Mocks

```typescript
// Deploy mock
const mock = await ethers.deployContract("MockContract", [args]);

// Use in tests
await mock.someFunction();
```

## Code Coverage

### Running Coverage

```bash
npm run coverage
```

### Coverage Configuration

Coverage is configured in:
- `hardhat.config.ts` - Main coverage settings
- `.solcover.js` - Additional coverage options

### Coverage Metrics

The coverage report includes:
- **Statement Coverage**: Percentage of statements executed
- **Branch Coverage**: Percentage of branches taken
- **Function Coverage**: Percentage of functions called
- **Line Coverage**: Percentage of lines executed

### Viewing Coverage

1. Generate report: `npm run coverage`
2. Open `coverage/index.html` in browser
3. Navigate to specific contracts to see coverage details

### Coverage Targets

Aim for:
- **Line Coverage**: 95%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%
- **Critical Paths**: 100%

### Improving Coverage

1. **Identify Gaps**: Review coverage report for uncovered lines
2. **Add Edge Cases**: Test boundary conditions
3. **Test Error Paths**: Test all revert conditions
4. **Test Events**: Verify all events are emitted
5. **Test View Functions**: Test all getter functions

### Excluded Files

The following are excluded from coverage:
- Test contracts (`test/`)
- Interfaces (`interfaces/`)
- Libraries (`libraries/`)
- Mock contracts (`MockEntryPoint.sol`, `MaliciousReentrancy.sol`)

## Best Practices

### 1. Use Descriptive Test Names

```typescript
// Good
it("Should revert when non-owner tries to configure amount range", async () => {
  // ...
});

// Bad
it("Should revert", async () => {
  // ...
});
```

### 2. Test One Thing Per Test

```typescript
// Good
it("Should add level", async () => { /* ... */ });
it("Should emit LevelAdded event", async () => { /* ... */ });

// Bad
it("Should add level and emit event", async () => {
  // Testing multiple things
});
```

### 3. Use beforeEach for Setup

```typescript
beforeEach(async () => {
  fixture = await deployFixture();
  account = fixture.account;
  owner = fixture.owner;
});
```

### 4. Clean Up After Tests

```typescript
afterEach(async () => {
  // Clean up if needed
});
```

### 5. Test Both Success and Failure Cases

```typescript
describe("configureAmountRange", () => {
  it("Should configure successfully", async () => {
    // Success case
  });

  it("Should revert if not owner", async () => {
    // Failure case
  });

  it("Should revert if invalid config", async () => {
    // Failure case
  });
});
```

### 6. Use Assertions Properly

```typescript
// Use expect for assertions
expect(value).to.equal(expected);
expect(value).to.be.true;
expect(value).to.be.revertedWith("Error");

// Use assert for chai assertions
assert.equal(value, expected);
```

### 7. Test Events

```typescript
it("Should emit event", async () => {
  const tx = await contract.function();
  const receipt = await tx.wait();
  
  const event = receipt.logs
    .map((log) => contract.interface.parseLog(log))
    .find((parsed) => parsed && parsed.name === "EventName");
  
  expect(event).to.not.be.null;
  expect(event!.args.param).to.equal(expected);
});
```

### 8. Test Gas Usage

```typescript
it("Should use reasonable gas", async () => {
  const tx = await contract.function();
  const receipt = await tx.wait();
  
  // Gas should be reasonable (adjust threshold as needed)
  expect(receipt.gasUsed).to.be.lessThan(500000);
});
```

## Troubleshooting

### Tests Timing Out

**Problem**: Tests take too long or timeout.

**Solution**:
1. Increase timeout in `hardhat.config.ts`:
```typescript
mocha: {
  timeout: 60000, // 60 seconds
}
```

2. Check for infinite loops or blocking operations
3. Use `time.increase()` for time-dependent tests

### Coverage Not Generating

**Problem**: Coverage report not generated.

**Solution**:
1. Ensure `hardhat-coverage` is installed: `npm install --save-dev hardhat-coverage`
2. Check coverage configuration in `hardhat.config.ts`
3. Run tests first: `npm test` then `npm run coverage`

### Tests Failing Intermittently

**Problem**: Tests pass sometimes but fail other times.

**Solution**:
1. Check for race conditions
2. Ensure proper cleanup between tests
3. Use `await` for all async operations
4. Check for non-deterministic behavior

### Gas Estimation Errors

**Problem**: Gas estimation fails in tests.

**Solution**:
1. Ensure contracts are deployed
2. Check contract state (may need setup)
3. Use `estimateGas` manually to debug

### Event Not Found

**Problem**: Cannot find event in receipt.

**Solution**:
1. Verify event is actually emitted
2. Check event name matches exactly
3. Use `interface.parseLog()` correctly
4. Check event is from correct contract

## Additional Resources

- [Hardhat Testing Documentation](https://hardhat.org/hardhat-runner/docs/guides/test-contracts)
- [Chai Assertions](https://www.chaijs.com/api/bdd/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Test Helpers](./helpers/README.md) - Helper utilities documentation

