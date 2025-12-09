# Test Helpers

Utilities and fixtures for writing tests.

## Fixtures

### `fixtures.ts`

Main fixture function that sets up the complete test environment.

#### `deployFixture()`

Deploys all contracts and returns a fixture object with:
- `account`: MultiLevelAccount instance
- `factory`: MultiLevelAccountFactory instance
- `entryPoint`: MockEntryPoint instance
- `level1`, `level2`, `level3`: Level contract instances
- `owner`: Account owner signer
- `ops1`, `ops2`, `ops3`: Level 1 signers
- `comp1`, `comp2`: Level 2 signers
- `exec`: Level 3 signer
- `others`: Additional signers

**Usage:**
```typescript
import { deployFixture, DeployFixture } from "../helpers/fixtures";

const fixture = await deployFixture();
const { account, level1, owner } = fixture;
```

**Pre-configured:**
- 3 levels with signers
- Amount ranges configured:
  - 0 - 10,000 ETH: Level 1 only
  - 10,001 - 1,000,000 ETH: Levels 1 → 2
  - 1,000,001+ ETH: Levels 1 → 2 → 3

## UserOp Helpers

### `userOp.ts`

Utilities for creating and managing ERC-4337 UserOperations.

#### `createUserOp(params)`

Creates a UserOperation struct.

**Parameters:**
- `sender`: Account address
- `nonce`: Transaction nonce
- `callData`: Encoded function call
- `gasLimits`: Gas limit values
- `fees`: Gas fee values

**Returns:** `PackedUserOperation`

#### `signUserOp(userOp, signer)`

Signs a UserOperation with the provided signer.

**Parameters:**
- `userOp`: UserOperation to sign
- `signer`: Signer to use

**Returns:** Signed `PackedUserOperation`

#### `getUserOpHash(userOp, entryPoint, chainId)`

Computes the UserOperation hash.

**Parameters:**
- `userOp`: UserOperation
- `entryPoint`: EntryPoint address
- `chainId`: Chain ID

**Returns:** `bytes32` hash

**Usage:**
```typescript
import { createUserOp, signUserOp, getUserOpHash } from "../helpers/userOp";

const userOp = await createUserOp({
  sender: accountAddress,
  nonce: await account.nonce(),
  callData: account.interface.encodeFunctionData("execute", [...]),
  // ... other params
});

const signedOp = await signUserOp(userOp, owner);
const hash = getUserOpHash(signedOp, entryPointAddress, chainId);
```

## Signature Helpers

### `signatures.ts`

Utilities for signature operations.

#### `signMessage(message, signer)`

Signs an arbitrary message.

**Parameters:**
- `message`: Message to sign (string or bytes)
- `signer`: Signer to use

**Returns:** Signature bytes

#### `recoverSigner(message, signature)`

Recovers the signer address from a signature.

**Parameters:**
- `message`: Original message
- `signature`: Signature bytes

**Returns:** Signer address

**Usage:**
```typescript
import { signMessage, recoverSigner } from "../helpers/signatures";

const message = "Hello, World!";
const signature = await signMessage(message, signer);
const recovered = recoverSigner(message, signature);

expect(recovered).to.equal(await signer.getAddress());
```

## SDK Test Helpers

### `sdk/helpers/sdkFixtures.ts`

Fixtures for SDK tests.

### `sdk/helpers/mockCoSigners.ts`

Mock co-signer implementations for testing signer behavior.

## Best Practices

### 1. Always Use Fixtures

Use `deployFixture()` for consistent test setup:

```typescript
beforeEach(async () => {
  fixture = await deployFixture();
});
```

### 2. Reuse Fixtures

Don't redeploy contracts in each test:

```typescript
// Good
const fixture = await deployFixture();
const account = fixture.account;

// Bad
const account = await deployAccount(); // Redeploys every time
```

### 3. Use Helper Functions

Create helper functions for common operations:

```typescript
async function proposeTransaction(account, entryPoint, owner, params) {
  const userOp = await createUserOp({...});
  const signedOp = await signUserOp(userOp, owner);
  const tx = await entryPoint.handleOps([signedOp], owner.address);
  const receipt = await tx.wait();
  // Extract and return txHash
  return txHash;
}
```

### 4. Clean Up When Needed

If tests modify state, clean up:

```typescript
afterEach(async () => {
  // Reset state if needed
});
```

## Examples

### Complete Test Using Helpers

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/fixtures";
import { createUserOp, signUserOp } from "../helpers/userOp";

describe("Example Test", () => {
  let fixture: DeployFixture;

  beforeEach(async () => {
    fixture = await deployFixture();
  });

  it("Should complete full flow", async () => {
    const { account, entryPoint, level1, owner, ops1, ops2 } = fixture;

    // Propose transaction
    const userOp = await createUserOp({
      sender: await account.getAddress(),
      nonce: await account.nonce(),
      callData: account.interface.encodeFunctionData("execute", [
        recipient.address,
        ethers.parseEther("1"),
        "0x",
        ethers.parseEther("5000"),
      ]),
    });
    const signedOp = await signUserOp(userOp, owner);
    const tx = await entryPoint.handleOps([signedOp], owner.address);
    const receipt = await tx.wait();
    const txHash = extractTxHash(receipt);

    // Approve at level 1
    await level1.connect(ops1).sign(txHash);
    await level1.connect(ops2).sign(txHash);
    await level1.completeTimelock(txHash);

    // Verify progression
    const currentIndex = await account.currentLevelIndex(txHash);
    expect(currentIndex).to.equal(1);
  });
});
```

## Additional Resources

- [Testing Guide](../TESTING_GUIDE.md) - Complete testing documentation
- [Test README](../README.md) - Test suite overview


