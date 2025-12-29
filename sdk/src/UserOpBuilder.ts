import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { encodeAbiParameters, keccak256, encodePacked } from "viem";
import { MultiLevelAccountPlugin, type MultiLevelAccountExecuteParams } from "./plugins/MultiLevelAccountPlugin";
import type { PackedUserOperation } from "./types";
import { ENTRY_POINT_ABI } from "./contracts/abis";

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
  private _bundlerUrl?: string;

  /**
   * Set bundler URL (can be updated dynamically)
   */
  setBundlerUrl(bundlerUrl: string | undefined): void {
    this._bundlerUrl = bundlerUrl;
  }

  get bundlerUrl(): string | undefined {
    return this._bundlerUrl;
  }

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
    this._bundlerUrl = bundlerUrl;

    this.plugin = new MultiLevelAccountPlugin(
      accountAddress,
      entryPointAddress,
      publicClient
    );
  }

  /**
   * Get gas prices from bundler (if available) or fall back to standard estimation
   */
  private async getGasPrices(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    // Try to get gas prices from bundler first (for Pimlico and similar)
    if (this._bundlerUrl) {
      try {
        const bundlerGasPrices = await this.getBundlerGasPrices();
        if (bundlerGasPrices) {
          return bundlerGasPrices;
        }
      } catch (error) {
        console.warn("Failed to get gas prices from bundler, falling back to standard estimation:", error);
      }
    }

    // Fall back to standard fee estimation
    try {
      const feeData = await this.publicClient.estimateFeesPerGas();
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n; // 1 gwei default
      const maxFeePerGas = feeData.maxFeePerGas || 2000000000n; // 2 gwei default

      // Add a small buffer to ensure we meet minimum requirements
      return {
        maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas + (maxFeePerGas / 10n) // Add 10% buffer
      };
    } catch (error: unknown) {
      // Fallback for chains that don't support EIP-1559 (like hardhat)
      const err = error as { name?: unknown; message?: unknown } | null | undefined;
      const name = typeof err?.name === "string" ? err.name : undefined;
      const message = typeof err?.message === "string" ? err.message : undefined;

      if (name === "Eip1559FeesNotSupportedError" || message?.includes("EIP-1559")) {
        // Use gas price for legacy chains
        const gasPrice = await this.publicClient.getGasPrice();
        return {
          maxFeePerGas: gasPrice,
          maxPriorityFeePerGas: 0n
        };
      } else {
        // Use defaults if estimation fails
        return {
          maxPriorityFeePerGas: 1000000000n, // 1 gwei default
          maxFeePerGas: 2000000000n // 2 gwei default
        };
      }
    }
  }

  /**
   * Get gas prices from bundler using pimlico_getUserOperationGasPrice or similar
   */
  private async getBundlerGasPrices(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null> {
    if (!this._bundlerUrl) return null;

    try {
      // Try Pimlico's gas price endpoint first
      const response = await fetch(this._bundlerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "pimlico_getUserOperationGasPrice",
          params: []
        })
      });

      const result = (await response.json()) as {
        error?: { message: string; code: number };
        result?: {
          slow?: { maxFeePerGas: string; maxPriorityFeePerGas: string };
          standard?: { maxFeePerGas: string; maxPriorityFeePerGas: string };
          fast?: { maxFeePerGas: string; maxPriorityFeePerGas: string };
        };
      };

      if (result.error) {
        // Try alternative method: eth_estimateUserOperationGas with dummy UserOp
        return null;
      }

      if (result.result) {
        const { slow, standard, fast } = result.result;
        // Use standard pricing (or fast if standard not available)
        const pricing = standard || fast || slow;

        if (pricing && pricing.maxFeePerGas && pricing.maxPriorityFeePerGas) {
          const maxFeePerGas = BigInt(pricing.maxFeePerGas);
          const maxPriorityFeePerGas = BigInt(pricing.maxPriorityFeePerGas);

          // Add a small buffer (5%) to ensure we meet minimum requirements
          return {
            maxFeePerGas: maxFeePerGas + (maxFeePerGas / 20n), // Add 5% buffer
            maxPriorityFeePerGas: maxPriorityFeePerGas + (maxPriorityFeePerGas / 20n) // Add 5% buffer
          };
        }
      }
    } catch {
      // If bundler doesn't support this method, return null to fall back
      return null;
    }

    return null;
  }

  /**
   * Build UserOperation for MultiLevelAccount
   */
  async buildUserOp(params: MultiLevelAccountExecuteParams): Promise<PackedUserOperation> {
    // Get nonce
    const nonce = await this.plugin.getNonce();

    // Encode execute call
    const callData = this.plugin.encodeExecute(params);

    // Get fee data - try bundler first, then fall back to standard estimation
    const { maxFeePerGas, maxPriorityFeePerGas } = await this.getGasPrices();

    // Pack gas limits (verificationGasLimit, callGasLimit)
    // Packed as two uint128 values in bytes32
    // Use higher limits to avoid validation failures
    // verificationGasLimit needs to cover validateUserOp + prefund + signature validation
    // callGasLimit needs to cover execute function
    const verificationGasLimit = 1000000n; // Increased significantly for validateUserOp + prefund
    const callGasLimit = 500000n; // Increased for execute function
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
      preVerificationGas: 200000n, // Increased for EntryPoint overhead
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
   * Converts packed format to unpacked format expected by bundler
   */
  async submitToBundler(userOp: PackedUserOperation, bundlerUrl?: string): Promise<Hex> {
    const url = bundlerUrl || this._bundlerUrl;
    if (!url) {
      throw new Error("Bundler URL required");
    }

    // Unpack accountGasLimits (bytes32) to verificationGasLimit and callGasLimit (uint128 each)
    const { verificationGasLimit, callGasLimit } = this._unpackAccountGasLimits(userOp.accountGasLimits as Hex);

    // Unpack gasFees (bytes32) to maxPriorityFeePerGas and maxFeePerGas (uint128 each)
    const { maxPriorityFeePerGas, maxFeePerGas } = this._unpackGasFees(userOp.gasFees as Hex);

    // Convert to hex strings for JSON-RPC
    const toHex = (value: bigint) => `0x${value.toString(16)}`;

    const send = async (
      rpcMethod: string,
      paramsUserOp: Record<string, string | null>,
      schemaLabel: string
    ) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: rpcMethod,
          params: [paramsUserOp, this.entryPointAddress],
        }),
      });

      const result = (await response.json()) as {
        error?: { message?: string; code?: number; data?: unknown };
        result?: Hex;
      };

      if (result.error) {
        const dataStr =
          typeof result.error.data === "string"
            ? result.error.data
            : result.error.data
              ? JSON.stringify(result.error.data)
              : "";
        const codeStr = typeof result.error.code === "number" ? ` code=${result.error.code}` : "";
        const dataSuffix = dataStr ? ` data=${dataStr}` : "";
        const msg = result.error.message || "Bundler error";
        throw new Error(`[${rpcMethod} ${schemaLabel}] ${msg}${codeStr}${dataSuffix}`);
      }

      if (!result.result) {
        throw new Error(`[${rpcMethod} ${schemaLabel}] No result from bundler`);
      }

      return result.result;
    };

    // Build userOp object for bundler (EntryPoint v0.7 JSON-RPC schema).
    const bundlerUserOpV7: Record<string, string | null> = {
      sender: userOp.sender,
      nonce: toHex(userOp.nonce),
      factory: null,
      factoryData: null,
      callData: userOp.callData,
      callGasLimit: toHex(callGasLimit),
      verificationGasLimit: toHex(verificationGasLimit),
      preVerificationGas: toHex(userOp.preVerificationGas),
      maxFeePerGas: toHex(maxFeePerGas),
      maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
      paymaster: null,
      paymasterVerificationGasLimit: null,
      paymasterPostOpGasLimit: null,
      paymasterData: null,
      signature: userOp.signature,
    };

    return await send("eth_sendUserOperation", bundlerUserOpV7, "sendUserOp:v0.7");
  }

  /**
   * Get UserOperation receipt from bundler
   * This returns the actual transaction hash once the UserOperation is included
   */
  async getUserOperationReceipt(
    userOpHash: Hex,
    bundlerUrl?: string
  ): Promise<{ receipt: unknown; actualTxHash: Hex | null } | null> {
    const url = bundlerUrl || this._bundlerUrl;
    if (!url) {
      throw new Error("Bundler URL required");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [userOpHash]
      })
    });

    const result = await response.json() as {
      error?: { message: string };
      result?: {
        userOpHash: Hex;
        entryPoint: Address;
        sender: Address;
        nonce: bigint;
        paymaster: Address | null;
        actualGasCost: bigint;
        actualGasUsed: bigint;
        success: boolean;
        logs: unknown[];
        receipt: {
          transactionHash: Hex;
          transactionIndex: bigint;
          blockHash: Hex;
          blockNumber: bigint;
          from: Address;
          to: Address | null;
          cumulativeGasUsed: bigint;
          gasUsed: bigint;
          contractAddress: Address | null;
          logs: unknown[];
          status: "success" | "reverted";
          logsBloom: Hex;
        };
      } | null;
    };

    if (result.error) {
      // Receipt not found yet - UserOperation might still be pending
      if (result.error.message?.includes("not found") || result.error.message?.includes("pending")) {
        return null;
      }
      throw new Error(`Bundler error: ${result.error.message}`);
    }

    if (!result.result) {
      return null; // Receipt not available yet
    }

    return {
      receipt: result.result,
      actualTxHash: result.result.receipt.transactionHash
    };
  }

  /**
   * Wait for UserOperation to be included and return transaction hash
   * Polls the bundler until the UserOperation receipt is available
   */
  async waitForUserOperationReceipt(
    userOpHash: Hex,
    bundlerUrl?: string,
    timeout: number = 120_000,
    pollingInterval: number = 2_000
  ): Promise<Hex> {
    const url = bundlerUrl || this._bundlerUrl;
    if (!url) {
      throw new Error("Bundler URL required");
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const receipt = await this.getUserOperationReceipt(userOpHash, url);

      if (receipt && receipt.actualTxHash) {
        return receipt.actualTxHash;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }

    throw new Error(`Timeout waiting for UserOperation receipt. UserOpHash: ${userOpHash}`);
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
    } catch {
      // Fallback to manual calculation if EntryPoint doesn't support it
      return this._computeUserOpHash(userOp, chainId);
    }
  }

  /**
   * Compute UserOperation hash manually
   */
  private _computeUserOpHash(userOp: PackedUserOperation, chainId: number): Hex {
    const packedUserOp = keccak256(
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "bytes32" },
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
        ]
      )
    );

    return keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [packedUserOp, this.entryPointAddress, BigInt(chainId)]
      )
    );
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

  /**
   * Unpack bytes32 to two uint128 values (accountGasLimits)
   */
  private _unpackAccountGasLimits(packed: Hex): { verificationGasLimit: bigint; callGasLimit: bigint } {
    // Packed format: first 16 bytes = verificationGasLimit, last 16 bytes = callGasLimit
    const hex = packed.replace("0x", "");
    const verificationGasLimitHex = hex.slice(0, 32); // First 16 bytes (32 hex chars)
    const callGasLimitHex = hex.slice(32, 64); // Last 16 bytes (32 hex chars)

    return {
      verificationGasLimit: BigInt(`0x${verificationGasLimitHex}` as `0x${string}`),
      callGasLimit: BigInt(`0x${callGasLimitHex}` as `0x${string}`)
    };
  }

  /**
   * Unpack bytes32 to two uint128 values (gasFees)
   */
  private _unpackGasFees(packed: Hex): { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } {
    // Packed format: first 16 bytes = maxPriorityFeePerGas, last 16 bytes = maxFeePerGas
    const hex = packed.replace("0x", "");
    const maxPriorityFeePerGasHex = hex.slice(0, 32); // First 16 bytes (32 hex chars)
    const maxFeePerGasHex = hex.slice(32, 64); // Last 16 bytes (32 hex chars)

    return {
      maxPriorityFeePerGas: BigInt(`0x${maxPriorityFeePerGasHex}` as `0x${string}`),
      maxFeePerGas: BigInt(`0x${maxFeePerGasHex}` as `0x${string}`)
    };
  }
}
