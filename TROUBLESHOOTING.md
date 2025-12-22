# Troubleshooting Guide

Common issues and solutions for the Multi-Level Sequential Approval System.

## Deployment Issues

### "Transaction receipt not found" or "Deployment failed"
- **Cause**: Network congestion or low gas price.
- **Solution**: Check your RPC provider status. If on a testnet, try increasing the gas price in `hardhat.config.ts` or wait for network congestion to clear.

### "Nonce too low"
- **Cause**: Your account has pending transactions that haven't been mined yet.
- **Solution**: 
  1. Reset your account in MetaMask (if using browser).
  2. Or, send a 0 ETH transaction to yourself with the correct next nonce to clear the stuck queue.
  3. Ensure you aren't running multiple deployment scripts simultaneously with the same account.

### "Verification failed: Already Verified"
- **Cause**: The contract code matches an already verified contract on Etherscan.
- **Solution**: This is harmless. Your contract is verified.

## Runtime / Execution Issues

### "AA23 reverted: ..." (EntryPoint Errors)
ERC-4337 EntryPoint errors often start with AA codes.
- **AA23**: Pre-fund too low. Ensure the smart account has enough ETH to pay for gas.
- **AA21**: Gas limit too low. Increase `verificationGasLimit` or `callGasLimit`.
- **AA10**: Sender not deployed. The account factory failed to deploy the account, or the address computed is wrong.

### "OnlyEntryPoint"
- **Cause**: You tried to call `execute` or `validateUserOp` directly from an EOA (Externally Owned Account).
- **Solution**: These functions can *only* be called by the official EntryPoint contract. Use the SDK's `proposeTransaction` method which formats the call correctly.

### "NoConfigForAmount"
- **Cause**: You proposed a transaction with an `amount` that falls into a gap between configured ranges.
- **Solution**: 
  - Check your configured ranges (`getAmountRange`).
  - Ensure `minAmount` and `maxAmount` cover the value you are sending.
  - Remember: ranges are inclusive.

### "LevelMismatch"
- **Cause**: A Level contract tried to call `onLevelApproved` but it wasn't the expected next level for that transaction.
- **Solution**: This usually happens if you manually re-deploy a Level contract but don't update the `MultiLevelAccount`'s configuration. Ensure level IDs and addresses match in the account config.

## SDK Issues

### "WalletClient required"
- **Cause**: You tried to perform a write action (sign, propose, execute) but initialized the SDK with only a PublicClient.
- **Solution**: Pass a `walletClient` to the SDK constructor.

```typescript
const walletClient = createWalletClient({ account, transport: http(...) });
const sdk = new MultiLevelAccountSDK(..., walletClient);
```

### "Transaction not appearing in pending list"
- **Cause**: 
  1. The transaction proposal failed (check console for AA errors).
  2. The indexing/event listener missed the event.
  3. You are looking at the wrong level (the transaction might be at Level 2, but you are checking Level 1).
- **Solution**: Check `getTransactionStatus(txHash)` to see exactly where the transaction is.

### "Signature invalid"
- **Cause**: The signer trying to sign is not authorized for that level.
- **Solution**: Call `getSigners()` on the Level interface to verify your wallet address is in the allowed list.

## Test Issues

### "Timeout of 20000ms exceeded"
- **Cause**: Hardhat tests on local node can be slow, especially with multiple signers.
- **Solution**: Increase timeout in `hardhat.config.ts`:
  ```typescript
  mocha: {
    timeout: 60000
  }
  ```

### "Gas estimation failed"
- **Cause**: The transaction will revert.
- **Solution**: Use `console.log` inside the contract (via `hardhat/console.sol`) or check the revert reason string in the error message.

