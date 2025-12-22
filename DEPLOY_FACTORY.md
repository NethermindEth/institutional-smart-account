# Deploy Factory to Sepolia

## Prerequisites

1. Add to `implementation/.env`:
```bash
SEPOLIA_RPC_URL=your_sepolia_rpc_url
PRIVATE_KEY=your_private_key_without_0x_prefix
```

Get RPC URL from:
- Alchemy: https://www.alchemy.com/ (recommended)
- Infura: https://infura.io/
- Or use public: https://rpc.sepolia.org

## Deploy

```bash
cd implementation
npm run deploy:factory:sepolia
```

Or use the helper script:
```bash
./scripts/deploy-factory-sepolia.sh
```

## After Deployment

Copy the factory address from the output and add to `website/.env.local`:

```bash
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
```

Then restart your Next.js dev server.


