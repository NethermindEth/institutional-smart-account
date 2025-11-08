import { encodeFunctionData, type Address, type Hex } from "viem";
import type { PublicClient } from "viem";
import { MULTI_LEVEL_ACCOUNT_ABI } from "../contracts/abis";

/**
 * Parameters for executing a transaction on MultiLevelAccount
 */
export interface MultiLevelAccountExecuteParams {
  to: Address;
  value: bigint;
  data: Hex;
  amount: bigint;
}

/**
 * MultiLevelAccount Plugin for permissionless.js
 * 
 * This plugin provides utilities for building UserOperations
 * for MultiLevelAccount using permissionless.js and viem.
 */
export class MultiLevelAccountPlugin {
  private accountAddress: Address;
  private publicClient: PublicClient;
  private entryPointAddress: Address;

  constructor(
    accountAddress: Address,
    entryPointAddress: Address,
    publicClient: PublicClient
  ) {
    this.accountAddress = accountAddress;
    this.entryPointAddress = entryPointAddress;
    this.publicClient = publicClient;
  }

  /**
   * Encode execute function call for MultiLevelAccount
   */
  encodeExecute(params: MultiLevelAccountExecuteParams): Hex {
    return encodeFunctionData({
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "execute",
      args: [params.to, params.value, params.data, params.amount]
    });
  }

  /**
   * Get the current nonce for the account
   */
  async getNonce(): Promise<bigint> {
    const nonce = await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "nonce"
    });
    return nonce as bigint;
  }

  /**
   * Get account address
   */
  getAccountAddress(): Address {
    return this.accountAddress;
  }

  /**
   * Get entry point address
   */
  getEntryPointAddress(): Address {
    return this.entryPointAddress;
  }
}

/**
 * Create a MultiLevelAccount plugin instance
 */
export function createMultiLevelAccountPlugin(
  accountAddress: Address,
  entryPointAddress: Address,
  publicClient: PublicClient
): MultiLevelAccountPlugin {
  return new MultiLevelAccountPlugin(
    accountAddress,
    entryPointAddress,
    publicClient
  );
}

