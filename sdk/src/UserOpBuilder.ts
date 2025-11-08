import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { encodeFunctionData, keccak256, encodePacked } from "viem";
import { http } from "viem";
import { MultiLevelAccountPlugin, type MultiLevelAccountExecuteParams } from "./plugins/MultiLevelAccountPlugin";
import type { PackedUserOperation } from "./types";
import { MULTI_LEVEL_ACCOUNT_ABI, ENTRY_POINT_ABI } from "./contracts/abis";

/**
 * UserOpBuilder using permissionless.js and viem
 * 
 * Replaces the custom implementation with permissionless.js for
 * building and submitting UserOperations.
 */
export class UserOpBuilder {
  private accountAddress: Address;
  private entryPointAddress: Address;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private plugin: MultiLevelAccountPlugin;
  private bundlerUrl?: string;

  constructor(
    accountAddress: Address,
    entryPointAddress: Address,
    publicClient: PublicClient,
    walletClient?: WalletClient,
    bundlerUrl?: string
  ) {
    this.accountAddress = accountAddress;
    this.entryPointAddress = entryPointAddress;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.bundlerUrl = bundlerUrl;
    
    this.plugin = new MultiLevelAccountPlugin(
      accountAddress,
      entryPointAddress,
      publicClient
    );
  }

  /**
   * Build UserOperation for MultiLevelAccount
   */
  async buildUserOp(params: MultiLevelAccountExecuteParams): Promise<PackedUserOperation> {
    // Get nonce
    const nonce = await this.plugin.getNonce();
    
    // Encode execute call
    const callData = this.plugin.encodeExecute(params);
    
    // Get fee data - handle chains that don't support EIP-1559
    let maxFeePerGas: bigint;
    let maxPriorityFeePerGas: bigint;
    
    try {
      const feeData = await this.publicClient.estimateFeesPerGas();
      maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n; // 1 gwei default
      maxFeePerGas = feeData.maxFeePerGas || 2000000000n; // 2 gwei default
    } catch (error: any) {
      // Fallback for chains that don't support EIP-1559 (like hardhat)
      if (error?.name === "Eip1559FeesNotSupportedError" || error?.message?.includes("EIP-1559")) {
        // Use gas price for legacy chains
        const gasPrice = await this.publicClient.getGasPrice();
        maxFeePerGas = gasPrice;
        maxPriorityFeePerGas = 0n;
      } else {
        // Use defaults if estimation fails
        maxPriorityFeePerGas = 1000000000n; // 1 gwei default
        maxFeePerGas = 2000000000n; // 2 gwei default
      }
    }
    
    // Pack gas limits (verificationGasLimit, callGasLimit)
    // Packed as two uint128 values in bytes32
    const verificationGasLimit = 200000n; // Default estimate
    const callGasLimit = 200000n; // Default estimate
    const accountGasLimits = this._packAccountGasLimits(verificationGasLimit, callGasLimit);
    
    // Pack gas fees (maxPriorityFeePerGas, maxFeePerGas)
    // Packed as two uint128 values in bytes32
    const gasFees = this._packGasFees(maxPriorityFeePerGas, maxFeePerGas);
    
    return {
      sender: this.accountAddress,
      nonce,
      initCode: "0x" as Hex,
      callData: callData as Hex,
      accountGasLimits: accountGasLimits as Hex,
      preVerificationGas: 50000n,
      gasFees: gasFees as Hex,
      paymasterAndData: "0x" as Hex,
      signature: "0x" as Hex
    };
  }

  /**
   * Sign UserOperation
   */
  async signUserOp(userOp: PackedUserOperation): Promise<PackedUserOperation> {
    if (!this.walletClient) {
      throw new Error("WalletClient required for signing");
    }

    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }

    // Get chain ID
    const chainId = await this.publicClient.getChainId();
    
    // Calculate userOp hash
    const userOpHash = await this._getUserOpHash(userOp, chainId);
    
    // Sign with wallet client
    const signature = await this.walletClient.signMessage({
      account,
      message: { raw: userOpHash }
    });
    
    return {
      ...userOp,
      signature: signature as Hex
    };
  }

  /**
   * Submit UserOperation to bundler
   */
  async submitToBundler(userOp: PackedUserOperation, bundlerUrl?: string): Promise<Hex> {
    const url = bundlerUrl || this.bundlerUrl;
    if (!url) {
      throw new Error("Bundler URL required");
    }

    // Submit to bundler via JSON-RPC
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [
          {
            sender: userOp.sender,
            nonce: `0x${userOp.nonce.toString(16)}`,
            initCode: userOp.initCode,
            callData: userOp.callData,
            accountGasLimits: userOp.accountGasLimits,
            preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
            gasFees: userOp.gasFees,
            paymasterAndData: userOp.paymasterAndData,
            signature: userOp.signature
          },
          this.entryPointAddress
        ]
      })
    });

    const result = await response.json() as { error?: { message: string }; result?: Hex };
    if (result.error) {
      throw new Error(`Bundler error: ${result.error.message}`);
    }

    if (!result.result) {
      throw new Error("No result from bundler");
    }

    return result.result;
  }

  /**
   * Get UserOperation hash
   */
  private async _getUserOpHash(userOp: PackedUserOperation, chainId: number): Promise<Hex> {
    // Use EntryPoint's getUserOpHash if available, otherwise compute manually
    try {
      const hash = await this.publicClient.readContract({
        address: this.entryPointAddress,
        abi: ENTRY_POINT_ABI,
        functionName: "getUserOpHash",
        args: [{
          sender: userOp.sender as Address,
          nonce: userOp.nonce,
          initCode: userOp.initCode as Hex,
          callData: userOp.callData as Hex,
          accountGasLimits: userOp.accountGasLimits as Hex,
          preVerificationGas: userOp.preVerificationGas,
          gasFees: userOp.gasFees as Hex,
          paymasterAndData: userOp.paymasterAndData as Hex,
          signature: userOp.signature as Hex
        }]
      });
      return hash as Hex;
    } catch (error) {
      // Fallback to manual calculation if EntryPoint doesn't support it
      return this._computeUserOpHash(userOp, chainId);
    }
  }

  /**
   * Compute UserOperation hash manually
   */
  private _computeUserOpHash(userOp: PackedUserOperation, chainId: number): Hex {
    // Pack userOp fields
    const packed = encodePacked(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint256",
        "bytes32",
        "bytes32",
        "address",
        "uint256"
      ],
      [
        userOp.sender as Address,
        userOp.nonce,
        keccak256(userOp.initCode as Hex),
        keccak256(userOp.callData as Hex),
        userOp.accountGasLimits as Hex,
        userOp.preVerificationGas,
        userOp.gasFees as Hex,
        keccak256(userOp.paymasterAndData as Hex),
        this.entryPointAddress,
        BigInt(chainId)
      ]
    );
    
    return keccak256(packed as Hex);
  }

  /**
   * Pack two uint128 values into bytes32
   */
  private _packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
    return encodePacked(
      ["uint128", "uint128"],
      [verificationGasLimit, callGasLimit]
    ) as Hex;
  }

  /**
   * Pack two uint128 values into bytes32
   */
  private _packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
    return encodePacked(
      ["uint128", "uint128"],
      [maxPriorityFeePerGas, maxFeePerGas]
    ) as Hex;
  }
}
