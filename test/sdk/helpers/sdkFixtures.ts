/**
 * SDK Test Fixtures
 * 
 * Sets up contracts and SDK instances for testing
 */

import { ethers } from "hardhat";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { MultiLevelAccountSDK } from "../../../sdk/src/MultiLevelAccountSDK";
import { SignerMap } from "../scenarios/coSignerBehaviors";
import { createHardhatPublicClient, hardhatTransport } from "../../helpers/hardhat-transport";

/**
 * Helper to create viem clients from ethers signer
 * Uses hardhat's account system to get private keys
 */
export async function createViemClientsFromEthersSigner(signer: any): Promise<{ publicClient: PublicClient; walletClient: WalletClient }> {
  // Use hardhat's provider directly via custom transport
  // This avoids HTTP connection issues in test environment
  const publicClient = createHardhatPublicClient();
  
  // Get private key from hardhat's account system
  // Hardhat uses deterministic accounts with a known mnemonic
  const signerAddress = await signer.getAddress();
  
  // Get all signers and find the matching one
  const allSigners = await ethers.getSigners();
  let signerIndex = -1;
  for (let i = 0; i < allSigners.length; i++) {
    if ((await allSigners[i].getAddress()) === signerAddress) {
      signerIndex = i;
      break;
    }
  }
  
  if (signerIndex < 0) {
    throw new Error(`Signer with address ${signerAddress} not found in hardhat accounts`);
  }
  
  // Hardhat's default mnemonic: "test test test test test test test test test test test junk"
  // Derive private key using BIP44 path: m/44'/60'/0'/0/{index}
  const hre = require("hardhat");
  const networkConfig = hre.network.config;
  const accounts = networkConfig.accounts;
  
  let privateKey: string;
  if (Array.isArray(accounts) && accounts[signerIndex]) {
    // Accounts array contains private keys directly
    privateKey = accounts[signerIndex];
  } else {
    // Use hardhat's default mnemonic to derive
    // Hardhat's default: "test test test test test test test test test test test junk"
    const mnemonic = "test test test test test test test test test test test junk";
    const { HDKey } = require("@scure/bip32");
    const { mnemonicToSeedSync } = require("@scure/bip39");
    const seed = mnemonicToSeedSync(mnemonic);
    const hdkey = HDKey.fromMasterSeed(seed);
    const child = hdkey.derive(`m/44'/60'/0'/0/${signerIndex}`);
    privateKey = "0x" + Buffer.from(child.privateKey!).toString("hex");
  }
  
  // Ensure private key has 0x prefix
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: hardhatTransport()
  });
  
  return { publicClient, walletClient };
}

export interface SDKFixture {
  account: any;
  factory: any;
  entryPoint: any;
  level1: any;
  level2: any;
  level3: any;
  owner: any;
  ops1: any;
  ops2: any;
  ops3: any;
  comp1: any;
  comp2: any;
  exec: any;
  others: any[];
  sdk: MultiLevelAccountSDK;
  signerMap: SignerMap;
}

export async function deploySDKFixture(): Promise<SDKFixture> {
  const [owner, ops1, ops2, ops3, comp1, comp2, exec, ...others] = 
    await ethers.getSigners();
  
  // Deploy EntryPoint
  const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
  const entryPoint = await EntryPointFactory.deploy();
  
  // Deploy Factory
  const Factory = await ethers.getContractFactory("MultiLevelAccountFactory");
  const factory = await Factory.deploy(await entryPoint.getAddress());
  
  // Create account with 3 levels
  const tx = await factory.createAccount(
    owner.address,
    [
      [ops1.address, ops2.address, ops3.address], // Level 1
      [comp1.address, comp2.address],              // Level 2
      [exec.address]                               // Level 3
    ],
    0 // salt
  );
  
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Transaction receipt not found");
  }
  
  // Find AccountCreated event
  const accountCreatedEvent = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "AccountCreated");
  
  if (!accountCreatedEvent || !accountCreatedEvent.args) {
    throw new Error("AccountCreated event not found");
  }
  
  const accountAddress = accountCreatedEvent.args[0];
  
  const account = await ethers.getContractAt("MultiLevelAccount", accountAddress);
  
  // Get level addresses
  const level1Address = await account.levelContracts(1);
  const level2Address = await account.levelContracts(2);
  const level3Address = await account.levelContracts(3);
  
  const level1 = await ethers.getContractAt("Level", level1Address);
  const level2 = await ethers.getContractAt("Level", level2Address);
  const level3 = await ethers.getContractAt("Level", level3Address);
  
  // Configure amount ranges
  await account.connect(owner).configureAmountRange(
    0,
    ethers.parseEther("10000"),
    [1],
    [2],
    [3600] // 1 hour
  );
  
  await account.connect(owner).configureAmountRange(
    ethers.parseEther("10001"),
    ethers.parseEther("1000000"),
    [1, 2],
    [2, 2],
    [3600, 7200] // 1hr, 2hr
  );
  
  await account.connect(owner).configureAmountRange(
    ethers.parseEther("1000001"),
    ethers.MaxUint256,
    [1, 2, 3],
    [3, 2, 1],
    [3600, 7200, 86400] // 1hr, 2hr, 24hr
  );
  
  // Create viem clients for SDK
  const { publicClient, walletClient } = await createViemClientsFromEthersSigner(owner);
  
  // Create SDK instance
  const sdk = new MultiLevelAccountSDK(
    accountAddress,
    await entryPoint.getAddress(),
    publicClient,
    walletClient
  );
  
  // Create signer map
  const signerMap: SignerMap = {
    ops1: ops1.address,
    ops2: ops2.address,
    ops3: ops3.address,
    comp1: comp1.address,
    comp2: comp2.address,
    exec: exec.address
  };
  
  return {
    account,
    factory,
    entryPoint: entryPoint,
    level1,
    level2,
    level3,
    owner,
    ops1,
    ops2,
    ops3,
    comp1,
    comp2,
    exec,
    others,
    sdk,
    signerMap
  };
}

// Export helper for use in other test files
export { createViemClientsFromEthersSigner };

