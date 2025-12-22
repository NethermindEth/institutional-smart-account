# Scripts (deployment & ops)

This folder contains Hardhat scripts used for local development deployments, public network deployments, configuration, and verification.

## Prerequisites

- Install deps from the repo root:

```bash
cd implementation
npm install
```

- Create a local `.env` file (do **not** commit it):

```bash
cd implementation
cp env.example .env
```

## Scripts

### `deploy.ts` — local dev deployment (factory + sample account)

Deploys:
- a **MockEntryPoint** (unless you set `ENTRYPOINT_ADDRESS`)
- `MultiLevelAccountFactory`
- an example `MultiLevelAccount` via the factory
- default amount ranges via `configureAmountRange(...)`

Run:

```bash
cd implementation
npx hardhat node
```

In a second terminal:

```bash
cd implementation
npm run deploy:local
```

Env vars:
- `ENTRYPOINT_ADDRESS` (optional)
- `LEVEL1_SIGNER1`, `LEVEL1_SIGNER2`, `LEVEL1_SIGNER3` (optional)
- `LEVEL2_SIGNER1`, `LEVEL2_SIGNER2` (optional)
- `LEVEL3_SIGNER1` (optional)

Notes:
- This script is meant for **local dev**. For public networks, use the official ERC-4337 EntryPoint address (or `deploy-factory-only.ts` for Sepolia).

### `deploy-factory-only.ts` — deploy factory (Sepolia)

Deploys only the `MultiLevelAccountFactory` against Sepolia and prints a `NEXT_PUBLIC_FACTORY_ADDRESS=...` line for the website.

Run:

```bash
cd implementation
npm run deploy:factory:sepolia
```

Env vars:
- `SEPOLIA_RPC_URL` (required)
- `PRIVATE_KEY` (required)
- `ENTRYPOINT_ADDRESS` (optional; defaults to Sepolia EntryPoint `0x0000000071727De22E5E9d8BAf0edAc6f37da032`)

Related doc: `DEPLOY_FACTORY.md`.

### `deploy-entrypoint.ts` — deploy EntryPoint (local/testing)

This script is used to deploy an EntryPoint for local tooling/testing.

Run:

```bash
cd implementation
npx hardhat run scripts/deploy-entrypoint.ts --network localhost
```

### `setup-config.ts` — configure amount ranges on an existing account

Configures a `MultiLevelAccount` (by address) with default amount ranges.

Run:

```bash
cd implementation
ACCOUNT_ADDRESS=0xYourAccount npx hardhat run scripts/setup-config.ts --network sepolia
```

Env vars:
- `ACCOUNT_ADDRESS` (required)
- `PRIVATE_KEY` and the chosen network RPC URL (required for public networks)

### `verify.ts` — etherscan verification helper

Wraps `hardhat verify` with env-provided args.

Run:

```bash
cd implementation
CONTRACT_ADDRESS=0x... CONSTRUCTOR_ARGS=0x... npx hardhat run scripts/verify.ts --network sepolia
```

Env vars:
- `CONTRACT_ADDRESS` (required)
- `CONSTRUCTOR_ARGS` (optional; comma-separated)
- `ETHERSCAN_API_KEY` / `BASESCAN_API_KEY` / etc. (required for the chosen network)


