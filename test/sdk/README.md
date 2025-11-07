# SDK Tests

This directory contains comprehensive tests for the Multi-Level Approval System SDK.

## Test Structure

### Test Files

- **MultiLevelAccountSDK.test.ts** - Main SDK functionality tests
- **SignerInterface.test.ts** - Privacy-preserving signer interface tests
- **UserOpBuilder.test.ts** - UserOperation building and signing tests
- **EventMonitor.test.ts** - Transaction event monitoring tests

### Test Helpers

- **helpers/sdkFixtures.ts** - SDK test fixtures and setup
- **helpers/mockCoSigners.ts** - Mock co-signer implementation
- **scenarios/coSignerBehaviors.ts** - Co-signer behavior scenario definitions

## Co-Signer Scenarios

The `coSignerBehaviors.ts` file defines 10 different scenarios that test how co-signers behave:

1. **Happy Path** - All signers approve at all levels
2. **Early Denial** - Level 1 denies immediately
3. **Mid-Level Denial** - Level 2 denies after Level 1 approves
4. **Late Denial** - Level 3 denies after Levels 1+2 approve
5. **Partial Quorum** - Not enough signers, transaction times out
6. **Conditional Approval** - Amount-based behavior
7. **Slow Approval** - All approve but with delays
8. **Mixed Behavior** - Some sign, some abstain
9. **Veto Power** - Executive denies at final level
10. **Rapid Approval** - All sign immediately

Each scenario is defined with:
- Expected outcome (approved/denied/pending/timeout)
- Behavior for each level (which signers sign/deny/abstain)
- Timing delays for each action

## Running Tests

```bash
# Run all SDK tests
npm run test:sdk

# Run specific test file
npm test test/sdk/MultiLevelAccountSDK.test.ts
```

## Test Coverage

The SDK tests cover:
- ✅ SDK initialization
- ✅ Transaction proposal via UserOp
- ✅ Signer interface privacy
- ✅ Co-signer scenarios (all 10 scenarios)
- ✅ Event monitoring
- ✅ Transaction status tracking
- ✅ Transaction execution

