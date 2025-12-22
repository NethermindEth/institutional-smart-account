import type { Address, Hex, PublicClient } from "viem";
import { decodeEventLog } from "viem";
import { TransactionStatus, LevelStatus } from "./types";
import { MULTI_LEVEL_ACCOUNT_ABI, LEVEL_ABI } from "./contracts/abis";

export class EventMonitor {
  private accountAddress: Address;
  private publicClient: PublicClient;
  
  constructor(
    accountAddress: Address | string,
    publicClient: PublicClient
  ) {
    this.accountAddress = accountAddress as Address;
    this.publicClient = publicClient;
  }
  
  /**
   * Watch transaction progress
   * Uses polling to check for status changes
   */
  watchTransaction(
    txHash: string,
    callback: (status: TransactionStatus) => void
  ): () => void {
    let lastStatus: TransactionStatus | null = null;
    let intervalId: NodeJS.Timeout;
    let isActive = true;
    let lastDeniedBlockChecked = 0;
    
    const checkStatus = async () => {
      if (!isActive) return;
      
      try {
        const currentStatus = await this.getTransactionStatus(txHash);
        
        // Only call callback if status changed
        if (!lastStatus || 
            lastStatus.currentLevelIndex !== currentStatus.currentLevelIndex ||
            lastStatus.fullyApproved !== currentStatus.fullyApproved) {
          callback(currentStatus);
          lastStatus = currentStatus;
        }
        
        // Stop polling if transaction is executed or denied
        if (currentStatus.fullyApproved) {
          // Check if executed by looking for TransactionExecuted event
          const eventAbi = MULTI_LEVEL_ACCOUNT_ABI.find((e) => 
            e.type === "event" && (e as any).name === "TransactionExecuted"
          ) as any;
          const logs = await this.publicClient.getLogs({
            address: this.accountAddress,
            event: {
              type: "event",
              name: "TransactionExecuted",
              inputs: eventAbi?.inputs || []
            },
            args: { txHash: txHash as Hex }
          });
          
          if (logs.length > 0) {
            isActive = false;
            clearInterval(intervalId);
            return;
          }
        }
        
        // Check for denial
        const fromBlock =
          lastDeniedBlockChecked > 0 ? BigInt(lastDeniedBlockChecked) : 0n;
        const deniedEventAbi = MULTI_LEVEL_ACCOUNT_ABI.find((e) => 
          e.type === "event" && (e as any).name === "TransactionDenied"
        ) as any;
        const deniedLogs = await this.publicClient.getLogs({
          address: this.accountAddress,
          event: {
            type: "event",
            name: "TransactionDenied",
            inputs: deniedEventAbi?.inputs || []
          },
          args: { txHash: txHash as Hex },
          fromBlock
        });
        
        if (deniedLogs.length > 0) {
          let levelId: number | undefined = undefined;
          
          for (const log of deniedLogs) {
            try {
              const decoded = decodeEventLog({
                abi: MULTI_LEVEL_ACCOUNT_ABI,
                eventName: "TransactionDenied",
                data: log.data,
                topics: log.topics
              });
              const decodedLevelId = (decoded.args as any)?.levelId ?? (decoded.args as any)?.[1];
              if (decodedLevelId !== undefined) {
                levelId = Number(decodedLevelId);
                break;
              }
            } catch {
              // Ignore decode errors, continue
            }
          }
          
          const updatedStatuses = currentStatus.levelStatuses.length > 0
            ? currentStatus.levelStatuses.map((ls) =>
                levelId !== undefined && ls.levelId === levelId
                  ? { ...ls, denied: true }
                  : ls
              )
            : (levelId !== undefined
                ? [{
                    levelId,
                    submitted: true,
                    approved: false,
                    denied: true,
                    signaturesCollected: 0,
                    signaturesRequired: 0,
                    timelockRemaining: 0
                  }]
                : currentStatus.levelStatuses);
          
          const deniedStatus = {
            ...currentStatus,
            levelStatuses: updatedStatuses
          };
          
          const lastLog = deniedLogs[deniedLogs.length - 1];
          const logBlock = (lastLog as any)?.blockNumber;
          if (typeof logBlock === "bigint") {
            lastDeniedBlockChecked = Number(logBlock + 1n);
          }
          
          callback(deniedStatus);
          lastStatus = deniedStatus;
          isActive = false;
          clearInterval(intervalId);
          return;
        }
      } catch (error) {
        console.error("Error checking transaction status:", error);
      }
    };
    
    // Initial status
    this.getTransactionStatus(txHash).then((status) => {
      lastStatus = status;
      callback(status);
    }).catch(console.error);
    
    // Poll every 2 seconds
    intervalId = setInterval(checkStatus, 2000);
    
    // Return unsubscribe function
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }
  
  /**
   * Get current transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const maxRetries = 3;
    const retryDelay = 1000;
    let txData: any | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        const result = await this.publicClient.readContract({
          address: this.accountAddress,
          abi: MULTI_LEVEL_ACCOUNT_ABI,
          functionName: "getTransaction",
          args: [txHash as Hex]
        }) as any;
        
        // Check if transaction exists - if to is zero address and value is 0, it's likely not stored
        // But we also check if proposedAt is 0 to be more certain
        if (!result || 
            (result.to === zeroAddress && 
             (result.value === 0n || result.value === "0" || Number(result.value) === 0) &&
             (result.proposedAt === 0n || result.proposedAt === "0" || Number(result.proposedAt) === 0))) {
          if (attempt < maxRetries - 1) {
            continue;
          }
          // Transaction not found - try to get it from events as fallback
          txData = await this._getTransactionFromEvents(txHash);
          if (!txData) {
            throw new Error(
              `Transaction not found in contract. ` +
              `This might be a bundle transaction hash. ` +
              `Please use the internal transaction hash from the TransactionProposed event. ` +
              `Hash: ${txHash}`
            );
          }
          break;
        }
        
        txData = {
          to: result.to as string,
          value: BigInt(result.value ?? 0),
          data: result.data as Hex,
          amount: BigInt(result.amount ?? 0),
          proposedAt: BigInt(result.proposedAt ?? 0),
          config: {
            minAmount: BigInt(result.config?.minAmount ?? 0),
            maxAmount: BigInt(result.config?.maxAmount ?? 0),
            levelIds: (result.config?.levelIds ?? []).map((id: bigint) => BigInt(id)),
            quorums: (result.config?.quorums ?? []).map((q: bigint) => BigInt(q)),
            timelocks: (result.config?.timelocks ?? []).map((t: bigint) => BigInt(t))
          }
        };
        
        break;
      } catch (error: any) {
        const message = error?.message ?? "";
        if (attempt < maxRetries - 1 &&
            (message.includes("Position") ||
             message.includes("out of bounds") ||
             message.includes("Transaction not found"))) {
          continue;
        }
        // If we haven't tried getting from events yet, try that
        if (!txData && !message.includes("Transaction not found in contract")) {
          try {
            txData = await this._getTransactionFromEvents(txHash);
            if (txData) {
              break; // Found it in events, continue with processing
            }
          } catch {
            // Ignore event lookup errors, throw original error
          }
        }
        throw error;
      }
    }
    
    const [currentIndex, fullyApproved] = await Promise.all([
      this.publicClient.readContract({
        address: this.accountAddress,
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        functionName: "currentLevelIndex",
        args: [txHash as Hex]
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.accountAddress,
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        functionName: "fullyApproved",
        args: [txHash as Hex]
      }) as Promise<boolean>
    ]);
    
    // Determine level IDs
    const levelIds = txData
      ? txData.config.levelIds
      : await this._getAllLevelIds();
    
    // Get level statuses - pass config quorums so we can show correct requirements
    // even for levels that haven't been submitted yet
    const levelStatuses = await this._getLevelStatuses(
      txHash,
      levelIds,
      txData?.config?.quorums
    );
    
    return {
      txHash,
      to: txData?.to ?? zeroAddress,
      value: txData?.value ?? 0n,
      amount: txData?.amount ?? 0n,
      proposedAt: txData ? new Date(Number(txData.proposedAt) * 1000) : new Date(0),
      currentLevelIndex: Number(currentIndex),
      fullyApproved,
      levelStatuses
    };
  }
  
  private async _getLevelStatuses(
    txHash: string,
    levelIds: readonly bigint[],
    configQuorums?: readonly bigint[]
  ): Promise<LevelStatus[]> {
    const statuses: LevelStatus[] = [];
    
    for (let i = 0; i < levelIds.length; i++) {
      const levelId = levelIds[i];
      const levelAddress = await this.publicClient.readContract({
        address: this.accountAddress,
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        functionName: "levelContracts",
        args: [levelId]
      }) as Address;
      
      const [stateResult, progressResult, remaining] = await Promise.all([
        this.publicClient.readContract({
          address: levelAddress,
          abi: LEVEL_ABI,
          functionName: "getApprovalState",
          args: [txHash as Hex]
        }) as Promise<any>,
        this.publicClient.readContract({
          address: levelAddress,
          abi: LEVEL_ABI,
          functionName: "getSignatureProgress",
          args: [txHash as Hex]
        }) as Promise<readonly [bigint, bigint]>,
        this.publicClient.readContract({
          address: levelAddress,
          abi: LEVEL_ABI,
          functionName: "getTimelockRemaining",
          args: [txHash as Hex]
        }) as Promise<bigint>
      ]);
      
      const state = (stateResult?.state ?? stateResult) as any;
      const progress = (progressResult as any);
      
      const submitted = state?.submitted ?? state?.[0] ?? false;
      const approved = state?.approved ?? state?.[5] ?? false;
      const denied = state?.denied ?? state?.[6] ?? false;
      const signatureCount = progress?.current ?? progress?.[0] ?? 0n;
      
      // Use quorum from config if available and level hasn't been submitted yet
      // This ensures we show the correct requirement even for future levels
      let requiredSignatures = progress?.required ?? progress?.[1] ?? 0n;
      if (requiredSignatures === 0n && configQuorums && i < configQuorums.length) {
        requiredSignatures = configQuorums[i];
      }
      
      statuses.push({
        levelId: Number(levelId),
        submitted: Boolean(submitted),
        approved: Boolean(approved),
        denied: Boolean(denied),
        signaturesCollected: Number(signatureCount),
        signaturesRequired: Number(requiredSignatures),
        timelockRemaining: Number(remaining)
      });
    }
    
    return statuses;
  }
  
  private async _getAllLevelIds(): Promise<bigint[]> {
    const nextLevelId = await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "nextLevelId"
    }) as bigint;
    
    const ids: bigint[] = [];
    for (let i = 1n; i < nextLevelId; i++) {
      ids.push(i);
    }
    return ids;
  }
  
  /**
   * Try to get transaction data from TransactionProposed events
   * This is a fallback when the transaction might have been deleted or not stored
   */
  private async _getTransactionFromEvents(txHash: string): Promise<any | null> {
    try {
      const eventAbi = MULTI_LEVEL_ACCOUNT_ABI.find((e) => 
        e.type === "event" && (e as any).name === "TransactionProposed"
      ) as any;
      
      if (!eventAbi) {
        return null;
      }
      
      const logs = await this.publicClient.getLogs({
        address: this.accountAddress,
        event: {
          type: "event",
          name: "TransactionProposed",
          inputs: eventAbi.inputs || []
        },
        // Important: without a fromBlock, some clients default to a narrow range and
        // we can miss historical TransactionProposed logs (especially after the
        // transaction is denied/executed and removed from storage).
        fromBlock: 0n,
        args: { txHash: txHash as Hex }
      });
      
      if (logs.length === 0) {
        return null;
      }
      
      // Get the most recent event
      const log = logs[logs.length - 1];
      const decoded = decodeEventLog({
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        eventName: "TransactionProposed",
        data: log.data,
        topics: log.topics
      });
      
      const args = decoded.args as any;
      
      // We can get to, value, amount, levelIds, and quorums from the event
      // But we don't have data, proposedAt, or full config
      // So we'll construct a minimal txData object
      return {
        to: args.to as string,
        value: BigInt(args.value ?? 0),
        data: "0x" as Hex, // Not available in event
        amount: BigInt(args.amount ?? 0),
        proposedAt: BigInt(log.blockNumber ?? 0), // Use block number as approximation
        config: {
          minAmount: 0n,
          maxAmount: 0n,
          levelIds: (args.levelIds ?? []).map((id: bigint) => BigInt(id)),
          quorums: (args.quorums ?? []).map((q: bigint) => BigInt(q)),
          timelocks: [] // Not available in event
        }
      };
    } catch (error) {
      console.error("Error getting transaction from events:", error);
      return null;
    }
  }
}
