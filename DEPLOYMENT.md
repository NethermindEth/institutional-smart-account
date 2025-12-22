# Deployment Guide

This guide details how to deploy the Multi-Level Sequential Approval System to various networks.

## Prerequisites

1. **Environment Setup**
   Copy `env.example` to `.env` and fill in the required values.
   ```bash
   cp env.example .env
   ```

2. **Funding**
   Ensure your deployer account (`PRIVATE_KEY`) has enough ETH on the target network.

## Configuration (.env)

| Variable | Description | Required For |
|----------|-------------|--------------|
| `PRIVATE_KEY` | Deployer wallet private key (starts with 0x) | All public networks |
| `SEPOLIA_RPC_URL` | RPC URL for Sepolia (e.g. from Alchemy/Infura) | Sepolia deployment |
| `ETHERSCAN_API_KEY` | API key for contract verification | Verification |
| `ENTRYPOINT_ADDRESS` | ERC-4337 EntryPoint Address | All deployments |

### EntryPoint Addresses

We use **ERC-4337 v0.7**. Use the following canonical address:

| Network | EntryPoint v0.7 Address |
|---------|-------------------------|
| Mainnet | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Sepolia | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Base    | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Local   | Deployed automatically if not provided |

## Deployment Commands

### 1. Local Development
Deploys a local Hardhat node, MockEntryPoint, and the full system.

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npm run deploy:local
```

### 2. Sepolia Testnet (Factory Only)
Deploys only the Factory. This is best for integrating with the frontend, which deploys Accounts via the Factory.

```bash
npm run deploy:factory:sepolia
```
*Note: This script prints `NEXT_PUBLIC_FACTORY_ADDRESS` which you should copy to your website's `.env`.*

### 3. Sepolia Testnet (Full Demo Setup)
Deploys a Factory AND a demo Account with configured levels.

```bash
npm run deploy:sepolia
```

## Verification

Contracts are automatically verified if `ETHERSCAN_API_KEY` is present. To verify manually:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Post-Deployment

After deploying the **Factory**:
1. Update `NEXT_PUBLIC_FACTORY_ADDRESS` in `website/.env`.
2. Update `NEXT_PUBLIC_ENTRYPOINT_ADDRESS` in `website/.env`.

After deploying a **Demo Account**:
1. Note the account address.
2. Send some ETH to the account address to pay for gas (ERC-4337 requires the account to pay).

