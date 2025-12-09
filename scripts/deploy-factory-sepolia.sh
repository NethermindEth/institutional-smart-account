#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required variables are set
if [ -z "$SEPOLIA_RPC_URL" ]; then
  echo "Error: SEPOLIA_RPC_URL not set in .env file"
  echo "Please add: SEPOLIA_RPC_URL=your_rpc_url_here"
  exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY not set in .env file"
  echo "Please add: PRIVATE_KEY=your_private_key_here"
  exit 1
fi

echo "Deploying Factory to Sepolia..."
npx hardhat run scripts/deploy-factory-only.ts --network sepolia
