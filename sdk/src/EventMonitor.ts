import { Contract, Provider } from "ethers";
import { TransactionStatus, LevelStatus } from "./types";

export class EventMonitor {
  private account: Contract;
  private provider: Provider;
  
  constructor(
    account: Contract,
    provider: Provider
  ) {
    this.account = account;
    this.provider = provider;
  }
  
  /**
   * Watch transaction progress
   */
  watchTransaction(
    txHash: string,
    callback: (status: TransactionStatus) => void
  ): () => void {
    // Set up event listeners
    const levelCompletedFilter = this.account.filters.LevelCompleted(txHash);
    const readyFilter = this.account.filters.ReadyForExecution(txHash);
    const executedFilter = this.account.filters.TransactionExecuted(txHash);
    const deniedFilter = this.account.filters.TransactionDenied(txHash);
    
    const updateStatus = async () => {
      const status = await this.getTransactionStatus(txHash);
      callback(status);
    };
    
    this.account.on(levelCompletedFilter, updateStatus);
    this.account.on(readyFilter, updateStatus);
    this.account.on(executedFilter, updateStatus);
    this.account.on(deniedFilter, updateStatus);
    
    // Initial status
    updateStatus();
    
    // Return unsubscribe function
    return () => {
      this.account.off(levelCompletedFilter, updateStatus);
      this.account.off(readyFilter, updateStatus);
      this.account.off(executedFilter, updateStatus);
      this.account.off(deniedFilter, updateStatus);
    };
  }
  
  /**
   * Get current transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const [txData, currentIndex, fullyApproved] = await Promise.all([
      this.account.getTransaction(txHash),
      this.account.currentLevelIndex(txHash),
      this.account.fullyApproved(txHash)
    ]);
    
    // Get level statuses
    const levelStatuses = await this._getLevelStatuses(
      txHash,
      txData.config.levelIds
    );
    
    return {
      txHash,
      to: txData.to,
      value: txData.value,
      amount: txData.amount,
      proposedAt: new Date(Number(txData.proposedAt) * 1000),
      currentLevelIndex: Number(currentIndex),
      fullyApproved,
      levelStatuses
    };
  }
  
  private async _getLevelStatuses(
    txHash: string,
    levelIds: bigint[]
  ): Promise<LevelStatus[]> {
    const statuses: LevelStatus[] = [];
    
    for (const levelId of levelIds) {
      const levelAddress = await this.account.levelContracts(levelId);
      const levelAbi = [
        "function getApprovalState(bytes32 txHash) view returns ((bool submitted, uint256 requiredQuorum, uint256 signatureCount, uint256 timelockDuration, uint256 timelockEnd, bool approved, bool denied))",
        "function getSignatureProgress(bytes32 txHash) view returns (uint256, uint256)",
        "function getTimelockRemaining(bytes32 txHash) view returns (uint256)"
      ];
      const level = new Contract(levelAddress, levelAbi, this.provider);
      
      const [state, progress, remaining] = await Promise.all([
        level.getApprovalState(txHash),
        level.getSignatureProgress(txHash),
        level.getTimelockRemaining(txHash)
      ]);
      
      statuses.push({
        levelId: Number(levelId),
        submitted: state.submitted,
        approved: state.approved,
        denied: state.denied,
        signaturesCollected: Number(progress[0]),
        signaturesRequired: Number(progress[1]),
        timelockRemaining: Number(remaining)
      });
    }
    
    return statuses;
  }
}

