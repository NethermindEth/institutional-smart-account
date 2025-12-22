# SDK Examples

## Example 1: Propose Transaction

See `examples/01-propose-via-userop.ts`

## Example 2: Sign Transaction

See `examples/02-sign-transaction.ts`

## Example 3: Monitor Progress

See `examples/03-monitor-progress.ts`

## Example 4: Execute Approved Transaction

See `examples/04-execute-approved.ts`

## Complete Flow Example

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MultiLevelAccountSDK } from "../src/MultiLevelAccountSDK";

async function completeFlow() {
  const rpcUrl = "http://localhost:8545";
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  // Owner wallet (used to propose)
  const ownerAccount = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
  const ownerWalletClient = createWalletClient({
    account: ownerAccount,
    transport: http(rpcUrl),
  });
  
  const sdk = new MultiLevelAccountSDK(
    "0x...",
    "0x...",
    publicClient,
    ownerWalletClient
  );
  
  // 1. Owner proposes transaction
  const txHash = await sdk.proposeTransaction(
    "0x...",
    parseEther("100"),
    "0x",
    parseEther("50000")
  );
  
  // 2. Signers approve
  const level1Interface = sdk.getSignerInterface(1);
  await level1Interface.initialize();
  await level1Interface.sign(txHash);
  
  // 3. Monitor progress
  sdk.monitorTransaction(txHash, (status) => {
    console.log("Progress:", status);
  });
  
  // 4. Execute when ready
  const status = await sdk.getTransactionStatus(txHash);
  if (status.fullyApproved) {
    await sdk.executeApprovedTransaction(txHash);
  }
}
```

