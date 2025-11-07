# Multi-Level Sequential Approval System

ERC-4337 compatible multi-level sequential approval system for institutional blockchain accounts with amount-based routing, dynamic quorum, time-locked progression, and veto capability.

## Features

- **ERC-4337 Compatibility**: Standard transaction format via EntryPoint
- **Amount-Based Routing**: Different approval paths based on transaction amount
- **Dynamic Quorum**: Per-level quorum requirements based on amount
- **Time-Locked Progression**: Configurable timelocks between approval levels
- **Veto Capability**: Any signer can deny a transaction at any level
- **Privacy-Preserving**: Signers only see their level, not other levels
- **TypeScript SDK**: Full-featured SDK for easy integration
- **Comprehensive Tests**: Unit, integration, security, and ERC-4337 tests

## Project Structure

```
implementation/
├── contracts/          # Smart contracts
│   ├── core/          # Main contracts
│   ├── interfaces/    # Contract interfaces
│   └── libraries/     # Utility libraries
├── test/              # Test suite
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   ├── 4337/          # ERC-4337 tests
│   ├── security/      # Security tests
│   └── helpers/       # Test utilities
├── sdk/               # TypeScript SDK
└── scripts/           # Deployment scripts
```

## Prerequisites

- Node.js 18.x or higher
- npm

## Installation

```bash
npm install
```

## Usage

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:4337
npm run test:security
```

### Generate Coverage Report

```bash
npm run coverage
```

This generates a comprehensive coverage report for all Solidity contracts. The report includes:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

Reports are generated in the `coverage/` directory. Open `coverage/index.html` in a browser to view the detailed report.

**Coverage Targets:**
- Line Coverage: 95%+
- Branch Coverage: 90%+
- Function Coverage: 100%
- Critical Paths: 100%

### Deploy Contracts

```bash
# Deploy to local network
npm run deploy:local

# Deploy to Sepolia testnet
npm run deploy:sepolia
```

## Development

This project uses:
- **Hardhat** for development environment
- **TypeScript** for type safety
- **Ethers.js v6** for blockchain interaction
- **OpenZeppelin Contracts v5** for security
- **@account-abstraction/contracts** for ERC-4337 support

## SDK

A TypeScript SDK is included in the `sdk/` directory. See [SDK README](./sdk/README.md) for details.

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:4337
npm run test:security

# Generate coverage report
npm run coverage
```

## Deployment

```bash
# Deploy to local network
npm run deploy:local

# Deploy to Sepolia testnet
npm run deploy:sepolia
```

## Documentation

### Contracts
- [Contracts README](./contracts/README.md) - Contract overview and features
- [Contract Architecture](./contracts/ARCHITECTURE.md) - System architecture and design
- [Contract API Reference](./contracts/API.md) - Complete API documentation

### SDK
- [SDK README](./sdk/README.md) - SDK overview and quick start
- [SDK Architecture](./sdk/ARCHITECTURE.md) - SDK design and patterns
- [SDK API Documentation](./sdk/docs/API.md) - SDK API reference
- [SDK Integration Guide](./sdk/docs/INTEGRATION.md) - Complete integration guide
- [SDK Examples](./sdk/docs/EXAMPLES.md) - Usage examples

### Testing
- [Testing Overview](./test/README.md) - Test suite structure and overview
- [Testing Guide](./test/TESTING_GUIDE.md) - Complete testing guide
- [Test Helpers](./test/helpers/README.md) - Test utilities documentation

### Other
- [Implementation Plan](../implementaion_plan) - Complete technical specification

## License

MIT

