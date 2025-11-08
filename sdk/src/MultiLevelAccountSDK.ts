import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { UserOpBuilder } from "./UserOpBuilder";
import { SignerInterface } from "./SignerInterface";
import { EventMonitor } from "./EventMonitor";
import { TransactionStatus, PackedUserOperation } from "./types";
import { MULTI_LEVEL_ACCOUNT_ABI, ENTRY_POINT_ABI } from "./contracts/abis";

export class MultiLevelAccountSDK {
  private accountAddress: Address;
  private entryPointAddress: Address;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private userOpBuilder: UserOpBuilder;
  
  constructor(
    accountAddress: Address | string,
    entryPointAddress: Address | string,
    publicClientOrRpcUrl: PublicClient | string,
    walletClient?: WalletClient,
    bundlerUrl?: string
  ) {
    this.accountAddress = accountAddress as Address;
    this.entryPointAddress = entryPointAddress as Address;
    
    // Create PublicClient if RPC URL provided, otherwise use provided client
    if (typeof publicClientOrRpcUrl === "string") {
      this.publicClient = createPublicClient({
        transport: http(publicClientOrRpcUrl)
      });
    } else {
      this.publicClient = publicClientOrRpcUrl;
    }
    
    this.walletClient = walletClient;
    
    this.userOpBuilder = new UserOpBuilder(
      this.accountAddress,
      this.entryPointAddress,
      this.publicClient,
      this.walletClient,
      bundlerUrl
    );
  }
  
  // ============ Proposal (Owner Only) ============
  
  /**
   * Propose transaction via 4337 UserOp
   */
  async proposeTransaction(
    to: Address | string,
    value: bigint,
    data: Hex | string,
    amount: bigint,
    bundlerUrl?: string
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('WalletClient required');
    }
    
    // Build UserOp
    const userOp = await this.userOpBuilder.buildUserOp({
      to: to as Address,
      value,
      data: data as Hex,
      amount
    });
    
    // Sign UserOp
    const signedUserOp = await this.userOpBuilder.signUserOp(userOp);
    
    // Submit to bundler (or send directly to EntryPoint for testing)
    if (bundlerUrl || this.userOpBuilder["bundlerUrl"]) {
      const userOpHash = await this.userOpBuilder.submitToBundler(signedUserOp, bundlerUrl);
      
      // Wait for transaction and extract txHash from event
      // Note: This is a simplified approach - in production you'd want to poll for the receipt
      return userOpHash;
    } else {
      // Direct submission (for testing)
      if (!this.walletClient) {
        throw new Error("WalletClient required");
      }
      
      const [account] = await this.walletClient.getAddresses();
      if (!account) {
        throw new Error("No account found in wallet client");
      }
      
      // Submit directly to EntryPoint using viem
      const hash = await this.walletClient.writeContract({
        address: this.entryPointAddress,
        abi: ENTRY_POINT_ABI,
        functionName: "handleOps",
        args: [
          [{
            sender: signedUserOp.sender as Address,
            nonce: signedUserOp.nonce,
            initCode: signedUserOp.initCode as Hex,
            callData: signedUserOp.callData as Hex,
            accountGasLimits: signedUserOp.accountGasLimits as Hex,
            preVerificationGas: signedUserOp.preVerificationGas,
            gasFees: signedUserOp.gasFees as Hex,
            paymasterAndData: signedUserOp.paymasterAndData as Hex,
            signature: signedUserOp.signature as Hex
          }],
          account
        ],
        account,
        chain: undefined
      });
      
      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      // Extract txHash from TransactionProposed event
      const events = await this.publicClient.getLogs({
        address: this.accountAddress,
        event: {
          type: "event",
          name: "TransactionProposed",
          inputs: [
            { name: "txHash", type: "bytes32", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "value", type: "uint256", indexed: false },
            { name: "amount", type: "uint256", indexed: false },
            { name: "levelIds", type: "uint256[]", indexed: false },
            { name: "quorums", type: "uint256[]", indexed: false }
          ]
        },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      
      if (events && events.length > 0 && events[0].args?.txHash) {
        return events[0].args.txHash as string;
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
      this.accountAddress,
      levelId,
      this.publicClient,
      this.walletClient
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
      this.accountAddress,
      this.publicClient
    );
    
    return monitor.watchTransaction(txHash, callback);
  }
  
  /**
   * Get current transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const monitor = new EventMonitor(
      this.accountAddress,
      this.publicClient
    );
    
    return await monitor.getTransactionStatus(txHash);
  }
  
  // ============ Execution ============
  
  /**
   * Execute fully approved transaction
   */
  async executeApprovedTransaction(txHash: Hex | string): Promise<string> {
    if (!this.walletClient) {
      throw new Error("WalletClient required");
    }
    
    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }
    
    const hash = await this.walletClient.writeContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "executeApprovedTransaction",
      args: [txHash as Hex],
      account,
      chain: undefined
    });
    
    return hash;
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
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('WalletClient required');
    }
    
    const [account] = await this.walletClient.getAddresses();
    if (!account) {
      throw new Error("No account found in wallet client");
    }
    
    const hash = await this.walletClient.writeContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "configureAmountRange",
      args: [
        minAmount,
        maxAmount,
        levelIds.map(id => BigInt(id)),
        quorums.map(q => BigInt(q)),
        timelocks.map(t => BigInt(t))
      ],
      account,
      chain: undefined
    });
    
    return hash;
  }
}
