# Testing Overview

This directory contains the comprehensive test suite for the Multi-Level Sequential Approval System.

## Test Structure

```
test/
├── unit/              # Unit tests for individual contracts
├── integration/       # Integration tests for full flows
├── 4337/              # ERC-4337 specific tests
├── security/          # Security and vulnerability tests
├── sdk/               # SDK tests
└── helpers/           # Test utilities and fixtures
```

## Test Categories

### Unit Tests (`test/unit/`)

Tests individual contract functionality in isolation:
- `MultiLevelAccount.test.ts` - Account contract tests
- `Level.test.ts` - Level contract tests
- `MultiLevelAccountFactory.test.ts` - Factory tests
- `AmountRouting.test.ts` - Amount-based routing logic

### Integration Tests (`test/integration/`)

Tests complete workflows across multiple contracts:
- `FullFlow.test.ts` - Complete 3-level approval flow
- `ThreeLevel.test.ts` - Multi-level progression
- `Timelock.test.ts` - Timelock functionality
- `ConcurrentTransactions.test.ts` - Multiple transactions
- `Denial.test.ts` - Veto/denial scenarios

### ERC-4337 Tests (`test/4337/`)

Tests ERC-4337 compatibility:
- `EntryPointIntegration.test.ts` - EntryPoint integration
- `UserOpValidation.test.ts` - UserOperation validation
- `BundlerSimulation.test.ts` - Bundler simulation

### Security Tests (`test/security/`)

Security and vulnerability tests:
- `Reentrancy.test.ts` - Reentrancy attack prevention
- `AccessControl.test.ts` - Access control verification
- `SignatureReplay.test.ts` - Signature replay prevention
- `FrontRunning.test.ts` - Front-running protection

### SDK Tests (`test/sdk/`)

TypeScript SDK tests:
- `MultiLevelAccountSDK.test.ts` - Main SDK tests
- `SignerInterface.test.ts` - Signer interface tests
- `UserOpBuilder.test.ts` - UserOperation builder tests
- `EventMonitor.test.ts` - Event monitoring tests

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# ERC-4337 tests only
npm run test:4337

# Security tests only
npm run test:security

# SDK tests only
npm run test:sdk
```

### Run Specific Test File

```bash
npx hardhat test test/unit/MultiLevelAccount.test.ts
```

### Run Tests with Gas Reporting

```bash
REPORT_GAS=true npm test
```

## Code Coverage

### Generate Coverage Report

```bash
npm run coverage
```

This generates a comprehensive coverage report for all Solidity contracts.

### Coverage Configuration

Coverage is configured in `hardhat.config.ts` and `.solcover.js`:

- **Included Contracts**: All core contracts (`MultiLevelAccount`, `Level`, `MultiLevelAccountFactory`)
- **Excluded Contracts**: Test contracts, interfaces, and mocks
- **Coverage Metrics**: Statement, function, branch, and line coverage

### Coverage Reports

After running coverage, reports are generated in:
- `coverage/` - HTML coverage report (open `index.html` in browser)
- `coverage.json` - JSON coverage data

### Coverage Targets

Target coverage goals:
- **Line Coverage**: Minimum 95%
- **Branch Coverage**: Minimum 90%
- **Function Coverage**: 100%
- **Critical Paths**: 100% coverage

### Viewing Coverage Reports

```bash
# Generate report
npm run coverage

# Open HTML report (macOS)
open coverage/index.html

# Open HTML report (Linux)
xdg-open coverage/index.html

# Open HTML report (Windows)
start coverage/index.html
```

## Test Helpers

### Fixtures (`test/helpers/fixtures.ts`)

Provides `deployFixture()` function that:
- Deploys EntryPoint, Factory, and Account
- Creates 3 levels with signers
- Configures amount ranges
- Returns all deployed contracts and signers

**Usage:**
```typescript
import { deployFixture } from "../helpers/fixtures";

const fixture = await deployFixture();
const { account, level1, level2, level3, owner } = fixture;
```

### UserOp Helpers (`test/helpers/userOp.ts`)

Utilities for creating and signing UserOperations:
- `createUserOp()` - Create UserOperation struct
- `signUserOp()` - Sign UserOperation
- `getUserOpHash()` - Compute UserOperation hash

### Signature Helpers (`test/helpers/signatures.ts`)

Utilities for signature operations:
- `signMessage()` - Sign arbitrary messages
- `recoverSigner()` - Recover signer from signature

## Writing Tests

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed instructions on writing tests.

## Continuous Integration

Tests should pass in CI/CD pipelines. Coverage reports can be uploaded to services like:
- Codecov
- Coveralls
- GitHub Actions

## Best Practices

1. **Use Fixtures**: Always use `deployFixture()` for consistent test setup
2. **Clean State**: Each test should be independent
3. **Test Edge Cases**: Include boundary conditions and error cases
4. **Test Events**: Verify events are emitted correctly
5. **Test Reverts**: Verify proper error handling
6. **Gas Optimization**: Monitor gas usage in tests

## Troubleshooting

### Tests Failing

1. Check Hardhat network is running: `npx hardhat node`
2. Verify contract compilation: `npm run compile`
3. Check test timeout settings in `hardhat.config.ts`

### Coverage Issues

1. Ensure all test suites are run: `npm test`
2. Check excluded files in `.solcover.js`
3. Verify coverage configuration in `hardhat.config.ts`

### Gas Reporting

1. Set `REPORT_GAS=true` environment variable
2. Optional: Set `COINMARKETCAP_API_KEY` for USD pricing
3. Reports generated in `gas-report.txt`

## Additional Resources

- [Testing Guide](./TESTING_GUIDE.md) - Detailed testing instructions
- [Test Helpers Documentation](./helpers/README.md) - Helper utilities
- [Contract Documentation](../contracts/README.md) - Contract API reference


