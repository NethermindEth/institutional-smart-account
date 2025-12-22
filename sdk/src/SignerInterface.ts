import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { decodeEventLog, encodeFunctionData } from "viem";
import { PendingTransaction, ApprovalState } from "./types";
import { LEVEL_ABI, MULTI_LEVEL_ACCOUNT_ABI } from "./contracts/abis";

/**
 * Privacy-preserving interface for signers
 * Signers only see their level, not other levels
 */
export class SignerInterface {
  private accountAddress: Address;
  private levelAddress: Address | null = null;
  private levelId: number;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  
  constructor(
    accountAddress: Address | string,
    levelId: number,
    publicClient: PublicClient,
    walletClient?: WalletClient
  ) {
    this.accountAddress = accountAddress as Address;
    this.levelId = levelId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
  }
  
  async initialize(): Promise<void> {
    const levelAddress = await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "levelContracts",
      args: [BigInt(this.levelId)]
    });
    
    this.levelAddress = levelAddress as Address;
  }
  
  /**
   * Get pending transactions at this level
   */
  async getPendingTransactions(): Promise<PendingTransaction[]> {
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    // Query TransactionSubmitted events
    const logs = await this.publicClient.getLogs({
      address: this.levelAddress,
      event: {
        type: "event",
        name: "TransactionSubmitted",
        inputs: [
          { name: "txHash", type: "bytes32", indexed: true },
          { name: "requiredQuorum", type: "uint256", indexed: false },
          { name: "timelockDuration", type: "uint256", indexed: false }
        ]
      },
      fromBlock: 0n
    });
    
    const pending: PendingTransaction[] = [];
    
    for (const log of logs) {
      const decoded = decodeEventLog({
        abi: LEVEL_ABI,
        data: log.data,
        topics: log.topics
      });
      
      const txHash = (decoded.args as any).txHash as Hex;
      
      // Get approval state
      const stateResult = await this.publicClient.readContract({
        address: this.levelAddress!,
        abi: LEVEL_ABI,
        functionName: "getApprovalState",
        args: [txHash]
      }) as any;
      
      const rawState = stateResult?.state ?? stateResult;
      
      const state: ApprovalState = {
        submitted: Boolean(rawState?.submitted ?? rawState?.[0] ?? false),
        requiredQuorum: BigInt(rawState?.requiredQuorum ?? rawState?.[1] ?? 0),
        signatureCount: BigInt(rawState?.signatureCount ?? rawState?.[2] ?? 0),
        timelockDuration: BigInt(rawState?.timelockDuration ?? rawState?.[3] ?? 0),
        timelockEnd: BigInt(rawState?.timelockEnd ?? rawState?.[4] ?? 0),
        approved: Boolean(rawState?.approved ?? rawState?.[5] ?? false),
        denied: Boolean(rawState?.denied ?? rawState?.[6] ?? false)
      };
      
      // Only include if not yet approved/denied
      if (!state.approved && !state.denied) {
        // Fetch transaction details from MultiLevelAccount
        let txData: any;
        try {
          txData = await this.publicClient.readContract({
            address: this.accountAddress,
            abi: MULTI_LEVEL_ACCOUNT_ABI,
            functionName: "getTransaction",
            args: [txHash]
          }) as any;
          
          const zeroAddress = "0x0000000000000000000000000000000000000000";
          if (!txData || (typeof txData.to === "string" && (txData.to === zeroAddress || txData.to.toLowerCase() === zeroAddress.toLowerCase()))) {
            continue; // Transaction doesn't exist, skip it
          }
        } catch (error: any) {
          if (error.message?.includes("Position") || error.message?.includes("out of bounds") || error.message?.includes("Transaction not found")) {
            continue;
          }
          throw error;
        }
        
        const [progressResult, remaining] = await Promise.all([
          this.publicClient.readContract({
            address: this.levelAddress!,
            abi: LEVEL_ABI,
            functionName: "getSignatureProgress",
            args: [txHash]
          }) as Promise<readonly [bigint, bigint]>,
          this.publicClient.readContract({
            address: this.levelAddress!,
            abi: LEVEL_ABI,
            functionName: "getTimelockRemaining",
            args: [txHash]
          }) as Promise<bigint>
        ]);
        
        const progress = progressResult as any;
        const collected = progress?.current ?? progress?.[0] ?? 0n;
        const required = progress?.required ?? progress?.[1] ?? 0n;
        
        pending.push({
          txHash: txHash as string,
          to: txData.to as string,
          value: BigInt(txData.value ?? 0),
          data: txData.data as string,
          amount: BigInt(txData.amount ?? 0),
          signaturesCollected: Number(collected),
          signaturesRequired: Number(required),
          timelockRemaining: Number(remaining)
        });
      }
    }
    
    return pending;
  }
  
  /**
   * Sign (approve) transaction
   */
  async sign(txHash: Hex | string): Promise<string> {
    if (!this.walletClient) throw new Error('WalletClient required');
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }
    
    // Estimate gas and cap at block gas limit
    let gasLimit: bigint | undefined;
    try {
      const estimatedGas = await this.publicClient.estimateGas({
        account,
        to: this.levelAddress,
        data: encodeFunctionData({
          abi: LEVEL_ABI,
          functionName: "sign",
          args: [txHash as Hex]
        })
      });
      
      // Cap at block gas limit (16,777,216 for Sepolia, but use a safe margin)
      const BLOCK_GAS_LIMIT = 16000000n; // Leave some margin
      gasLimit = estimatedGas > BLOCK_GAS_LIMIT ? BLOCK_GAS_LIMIT : estimatedGas;
    } catch (error) {
      // If estimation fails, use a reasonable default
      console.warn("Gas estimation failed, using default:", error);
      gasLimit = 500000n; // Default gas limit for simple operations
    }
    
    const hash = await this.walletClient.writeContract({
      address: this.levelAddress,
      abi: LEVEL_ABI,
      functionName: "sign",
      args: [txHash as Hex],
      account,
      gas: gasLimit,
      chain: undefined
    });
    
    return hash;
  }
  
  /**
   * Deny transaction
   */
  async deny(txHash: Hex | string): Promise<string> {
    if (!this.walletClient) throw new Error('WalletClient required');
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }
    
    // Estimate gas and cap at block gas limit
    let gasLimit: bigint | undefined;
    try {
      const estimatedGas = await this.publicClient.estimateGas({
        account,
        to: this.levelAddress,
        data: encodeFunctionData({
          abi: LEVEL_ABI,
          functionName: "deny",
          args: [txHash as Hex]
        })
      });
      
      // Cap at block gas limit (16,777,216 for Sepolia, but use a safe margin)
      const BLOCK_GAS_LIMIT = 16000000n; // Leave some margin
      gasLimit = estimatedGas > BLOCK_GAS_LIMIT ? BLOCK_GAS_LIMIT : estimatedGas;
    } catch (error) {
      // If estimation fails, use a reasonable default
      console.warn("Gas estimation failed, using default:", error);
      gasLimit = 500000n; // Default gas limit for simple operations
    }
    
    const hash = await this.walletClient.writeContract({
      address: this.levelAddress,
      abi: LEVEL_ABI,
      functionName: "deny",
      args: [txHash as Hex],
      account,
      gas: gasLimit,
      chain: undefined
    });
    
    return hash;
  }
  
  /**
   * Complete timelock
   */
  async completeTimelock(txHash: Hex | string): Promise<string> {
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    // Anyone can call this, but if walletClient is provided, use it
    if (this.walletClient) {
      const [account] = await this.walletClient.getAddresses();
      if (account) {
        // Estimate gas and cap at block gas limit
        let gasLimit: bigint | undefined;
        try {
          const estimatedGas = await this.publicClient.estimateGas({
            account,
            to: this.levelAddress,
            data: encodeFunctionData({
              abi: LEVEL_ABI,
              functionName: "completeTimelock",
              args: [txHash as Hex]
            })
          });
          
          // Cap at block gas limit (16,777,216 for Sepolia, but use a safe margin)
          const BLOCK_GAS_LIMIT = 16000000n; // Leave some margin
          gasLimit = estimatedGas > BLOCK_GAS_LIMIT ? BLOCK_GAS_LIMIT : estimatedGas;
        } catch (error) {
          // If estimation fails, use a reasonable default
          console.warn("Gas estimation failed, using default:", error);
          gasLimit = 500000n; // Default gas limit for simple operations
        }
        
        const hash = await this.walletClient.writeContract({
          address: this.levelAddress,
          abi: LEVEL_ABI,
          functionName: "completeTimelock",
          args: [txHash as Hex],
          account,
          gas: gasLimit,
          chain: undefined
        });
        return hash;
      }
    }
    
    // Fallback: use public client (read-only, would need a different approach for writes)
    throw new Error("WalletClient required for completing timelock");
  }
  
  /**
   * Get my signing status
   */
  async getMyStatus(txHash: Hex | string): Promise<{
    signed: boolean;
    denied: boolean;
  }> {
    if (!this.walletClient) throw new Error('WalletClient required');
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }
    
    const [signed, denied] = await Promise.all([
      this.publicClient.readContract({
        address: this.levelAddress,
        abi: LEVEL_ABI,
        functionName: "hasSigned",
        args: [txHash as Hex, account]
      }) as Promise<boolean>,
      this.publicClient.readContract({
        address: this.levelAddress,
        abi: LEVEL_ABI,
        functionName: "hasDenied",
        args: [txHash as Hex, account]
      }) as Promise<boolean>
    ]);
    
    return { signed, denied };
  }
  
  /**
   * Get co-signers at this level
   */
  async getCoSigners(): Promise<string[]> {
    if (!this.levelAddress) await this.initialize();
    if (!this.levelAddress) throw new Error("Level not initialized");
    
    const signers = await this.publicClient.readContract({
      address: this.levelAddress,
      abi: LEVEL_ABI,
      functionName: "getSigners"
    }) as readonly Address[];
    
    return signers.map(s => s as string);
  }
  
  /**
   * Subscribe to new transactions
   * Note: viem doesn't have the same event subscription model as ethers
   * This uses polling instead
   */
  onNewTransaction(
    callback: (txHash: string) => void
  ): () => void {
    if (!this.levelAddress) throw new Error('Must initialize first');
    
    let lastBlockNumber: bigint | null = null;
    let intervalId: NodeJS.Timeout;
    
    const poll = async () => {
      try {
        const currentBlock = await this.publicClient.getBlockNumber();
        const fromBlock = lastBlockNumber !== null
          ? lastBlockNumber + 1n
          : (currentBlock > 100n ? currentBlock - 100n : 0n);
        
        const logs = await this.publicClient.getLogs({
          address: this.levelAddress!,
          event: {
            type: "event",
            name: "TransactionSubmitted",
            inputs: [
              { name: "txHash", type: "bytes32", indexed: true },
              { name: "requiredQuorum", type: "uint256", indexed: false },
              { name: "timelockDuration", type: "uint256", indexed: false }
            ]
          },
          fromBlock,
          toBlock: currentBlock
        });
        
        for (const log of logs) {
          const decoded = decodeEventLog({
            abi: LEVEL_ABI,
            data: log.data,
            topics: log.topics
          });
          callback((decoded.args as any).txHash as string);
        }
        
        lastBlockNumber = currentBlock;
      } catch (error) {
        console.error("Error polling for new transactions:", error);
      }
    };
    
    // Poll every 5 seconds
    intervalId = setInterval(poll, 5000);
    poll(); // Initial poll
    
    // Return unsubscribe function
    return () => {
      clearInterval(intervalId);
    };
  }
}
