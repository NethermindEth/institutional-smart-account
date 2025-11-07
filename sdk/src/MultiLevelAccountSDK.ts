import { Contract, Provider, Signer } from "ethers";
import { UserOpBuilder } from "./UserOpBuilder";
import { SignerInterface } from "./SignerInterface";
import { EventMonitor } from "./EventMonitor";
import { TransactionStatus, PackedUserOperation } from "./types";

export class MultiLevelAccountSDK {
  private account: Contract;
  private entryPoint: Contract;
  private provider: Provider;
  private signer?: Signer;
  private userOpBuilder: UserOpBuilder;
  
  constructor(
    accountAddress: string,
    entryPointAddress: string,
    providerOrSigner: Provider | Signer,
    accountAbi?: any[],
    entryPointAbi?: any[]
  ) {
    // Check if providerOrSigner is a Signer by checking for signMessage method
    if ('signMessage' in providerOrSigner && 'getAddress' in providerOrSigner) {
      this.signer = providerOrSigner as Signer;
      this.provider = (providerOrSigner as Signer).provider!;
    } else {
      this.provider = providerOrSigner as Provider;
    }
    
    // Default ABIs - in production, load from JSON files
    const defaultAccountAbi = accountAbi || [
      "function execute(address to, uint256 value, bytes data, uint256 amount)",
      "function executeApprovedTransaction(bytes32 txHash)",
      "function getTransaction(bytes32 txHash) view returns ((address to, uint256 value, bytes data, uint256 amount, uint256 proposedAt, (uint256 minAmount, uint256 maxAmount, uint256[] levelIds, uint256[] quorums, uint256[] timelocks) config))",
      "function currentLevelIndex(bytes32 txHash) view returns (uint256)",
      "function fullyApproved(bytes32 txHash) view returns (bool)",
      "function nonce() view returns (uint256)",
      "function levelContracts(uint256 levelId) view returns (address)",
      "function configureAmountRange(uint256 minAmount, uint256 maxAmount, uint256[] levelIds, uint256[] quorums, uint256[] timelocks)",
      "function addLevel(address levelAddress) returns (uint256)",
      "event TransactionProposed(bytes32 indexed txHash, address indexed to, uint256 value, uint256 amount, uint256[] levelIds, uint256[] quorums)",
      "event LevelCompleted(bytes32 indexed txHash, uint256 indexed levelId, uint256 currentIndex)",
      "event ReadyForExecution(bytes32 indexed txHash)",
      "event TransactionExecuted(bytes32 indexed txHash, address indexed to, uint256 value)",
      "event TransactionDenied(bytes32 indexed txHash, uint256 indexed levelId, address indexed denier)"
    ];
    
    const defaultEntryPointAbi = entryPointAbi || [
      "function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary)",
      "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)"
    ];
    
    this.account = new Contract(
      accountAddress,
      defaultAccountAbi,
      this.signer || this.provider
    );
    
    // EntryPoint needs a signer to send transactions (handleOps)
    this.entryPoint = new Contract(
      entryPointAddress,
      defaultEntryPointAbi,
      this.signer || this.provider
    );
    
    this.userOpBuilder = new UserOpBuilder(
      this.account,
      this.entryPoint,
      this.provider
    );
  }
  
  // ============ Proposal (Owner Only) ============
  
  /**
   * Propose transaction via 4337 UserOp
   */
  async proposeTransaction(
    to: string,
    value: bigint,
    data: string,
    amount: bigint,
    bundlerUrl?: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required');
    }
    
    // Build UserOp
    const userOp = await this.userOpBuilder.buildUserOp({
      to,
      value,
      data,
      amount
    });
    
    // Sign UserOp
    const signedUserOp = await this.userOpBuilder.signUserOp(
      userOp,
      this.signer
    );
    
    // Submit to bundler (or send directly to EntryPoint for testing)
    if (bundlerUrl) {
      const txHash = await this._submitToBundler(signedUserOp, bundlerUrl);
      return txHash;
    } else {
      // Direct submission (for testing)
      // The handleOps function expects PackedUserOperation[] which matches our interface
      // Just pass the signedUserOp directly - ethers will handle the conversion
      const tx = await this.entryPoint.handleOps(
        [signedUserOp],
        await this.signer.getAddress()
      );
      const receipt = await tx.wait();
      
      // Extract txHash from event
      const events = receipt?.logs
        .map((log) => {
          try {
            return this.account.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((parsed) => parsed && parsed.name === 'TransactionProposed');
      
      if (events && events.length > 0 && events[0]?.args) {
        return events[0].args[0]; // txHash
      }
      
      throw new Error("TransactionProposed event not found");
    }
  }
  
  // ============ Signer Interface ============
  
  /**
   * Get signer interface for a level
   */
  getSignerInterface(levelId: number): SignerInterface {
    return new SignerInterface(
      this.account,
      levelId,
      this.signer || this.provider
    );
  }
  
  // ============ Monitoring ============
  
  /**
   * Monitor transaction progress
   */
  monitorTransaction(
    txHash: string,
    callback: (status: TransactionStatus) => void
  ): () => void {
    const monitor = new EventMonitor(
      this.account,
      this.provider
    );
    
    return monitor.watchTransaction(txHash, callback);
  }
  
  /**
   * Get current transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const monitor = new EventMonitor(
      this.account,
      this.provider
    );
    
    return await monitor.getTransactionStatus(txHash);
  }
  
  // ============ Execution ============
  
  /**
   * Execute fully approved transaction
   */
  async executeApprovedTransaction(txHash: string): Promise<string> {
    const tx = await this.account.executeApprovedTransaction(txHash);
    const receipt = await tx.wait();
    return receipt!.hash;
  }
  
  // ============ Configuration (Owner Only) ============
  
  /**
   * Configure amount range
   */
  async configureAmountRange(
    minAmount: bigint,
    maxAmount: bigint,
    levelIds: number[],
    quorums: number[],
    timelocks: number[]
  ): Promise<void> {
    if (!this.signer) throw new Error('Signer required');
    
    const tx = await this.account.connect(this.signer).configureAmountRange(
      minAmount,
      maxAmount,
      levelIds,
      quorums,
      timelocks
    );
    
    await tx.wait();
  }
  
  // ============ Internal ============
  
  private async _submitToBundler(
    userOp: PackedUserOperation,
    bundlerUrl: string
  ): Promise<string> {
    const response = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [userOp, await this.entryPoint.getAddress()]
      })
    });
    
    const result = await response.json();
    return result.result; // userOpHash
  }
}

