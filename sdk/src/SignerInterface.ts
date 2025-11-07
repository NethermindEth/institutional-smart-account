import { Contract, Provider, Signer } from "ethers";
import { PendingTransaction, ApprovalState } from "./types";

/**
 * Privacy-preserving interface for signers
 * Signers only see their level, not other levels
 */
export class SignerInterface {
  private account: Contract;
  private level: Contract | null = null;
  private levelId: number;
  private provider: Provider;
  private signer?: Signer;
  
  constructor(
    account: Contract,
    levelId: number,
    providerOrSigner: Provider | Signer
  ) {
    this.account = account;
    this.levelId = levelId;
    
    // Check if providerOrSigner is a Signer by checking for signMessage method
    if ('signMessage' in providerOrSigner && 'getAddress' in providerOrSigner) {
      this.signer = providerOrSigner as Signer;
      this.provider = (providerOrSigner as Signer).provider!;
    } else {
      this.provider = providerOrSigner as Provider;
    }
  }
  
  async initialize(): Promise<void> {
    const levelAddress = await this.account.levelContracts(this.levelId);
    // Import contract ABI - for now using interface
    const levelAbi = [
      "function sign(bytes32 txHash)",
      "function deny(bytes32 txHash)",
      "function completeTimelock(bytes32 txHash)",
      "function getPendingTransactions() view returns (tuple[])",
      "function getApprovalState(bytes32 txHash) view returns ((bool submitted, uint256 requiredQuorum, uint256 signatureCount, uint256 timelockDuration, uint256 timelockEnd, bool approved, bool denied))",
      "function getSignatureProgress(bytes32 txHash) view returns (uint256, uint256)",
      "function getTimelockRemaining(bytes32 txHash) view returns (uint256)",
      "function hasSigned(bytes32 txHash, address signer) view returns (bool)",
      "function hasDenied(bytes32 txHash, address signer) view returns (bool)",
      "function getSigners() view returns (address[])",
      "event TransactionSubmitted(bytes32 indexed txHash, uint256 requiredQuorum, uint256 timelockDuration)",
      "event Signed(bytes32 indexed txHash, address indexed signer, uint256 signatureCount, uint256 requiredQuorum)",
      "event Denied(bytes32 indexed txHash, address indexed denier)"
    ];
    
    this.level = new Contract(
      levelAddress,
      levelAbi,
      this.signer || this.provider
    );
  }
  
  /**
   * Get pending transactions at this level
   */
  async getPendingTransactions(): Promise<PendingTransaction[]> {
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    
    // Query TransactionSubmitted events
    const filter = this.level.filters.TransactionSubmitted();
    const events = await this.level.queryFilter(filter);
    
    const pending: PendingTransaction[] = [];
    
    for (const event of events) {
      const txHash = event.args![0];
      const state = await this.level.getApprovalState(txHash);
      
      // Only include if not yet approved/denied
      if (!state.approved && !state.denied) {
        // Fetch transaction details from MultiLevelAccount
        const txData = await this.account.getTransaction(txHash);
        
        const [progress, remaining] = await Promise.all([
          this.level.getSignatureProgress(txHash),
          this.level.getTimelockRemaining(txHash)
        ]);
        
        pending.push({
          txHash,
          to: txData.to,
          value: txData.value,
          data: txData.data,
          amount: txData.amount,
          signaturesCollected: Number(progress[0]),
          signaturesRequired: Number(progress[1]),
          timelockRemaining: Number(remaining)
        });
      }
    }
    
    return pending;
  }
  
  /**
   * Sign (approve) transaction
   */
  async sign(txHash: string): Promise<void> {
    if (!this.signer) throw new Error('Signer required');
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    
    const tx = await this.level.connect(this.signer).sign(txHash);
    await tx.wait();
  }
  
  /**
   * Deny transaction
   */
  async deny(txHash: string): Promise<void> {
    if (!this.signer) throw new Error('Signer required');
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    
    const tx = await this.level.connect(this.signer).deny(txHash);
    await tx.wait();
  }
  
  /**
   * Complete timelock
   */
  async completeTimelock(txHash: string): Promise<void> {
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    
    const tx = await this.level.completeTimelock(txHash);
    await tx.wait();
  }
  
  /**
   * Get my signing status
   */
  async getMyStatus(txHash: string): Promise<{
    signed: boolean;
    denied: boolean;
  }> {
    if (!this.signer) throw new Error('Signer required');
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    
    const address = await this.signer.getAddress();
    
    const [signed, denied] = await Promise.all([
      this.level.hasSigned(txHash, address),
      this.level.hasDenied(txHash, address)
    ]);
    
    return { signed, denied };
  }
  
  /**
   * Get co-signers at this level
   */
  async getCoSigners(): Promise<string[]> {
    if (!this.level) await this.initialize();
    if (!this.level) throw new Error("Level not initialized");
    return await this.level.getSigners();
  }
  
  /**
   * Subscribe to new transactions
   */
  onNewTransaction(
    callback: (txHash: string) => void
  ): () => void {
    if (!this.level) throw new Error('Must initialize first');
    
    const filter = this.level.filters.TransactionSubmitted();
    
    const listener = (txHash: string) => {
      callback(txHash);
    };
    
    this.level.on(filter, listener);
    
    return () => this.level!.off(filter, listener);
  }
}

