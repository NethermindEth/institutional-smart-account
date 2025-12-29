import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { createPublicClient, http, decodeEventLog } from "viem";
import { UserOpBuilder } from "./UserOpBuilder";
import { SignerInterface } from "./SignerInterface";
import { EventMonitor } from "./EventMonitor";
import { TransactionStatus } from "./types";
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

    // Ensure the connected wallet is the account owner (signature validation will fail otherwise)
    try {
      const owner = await this.publicClient.readContract({
        address: this.accountAddress,
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        functionName: "owner",
      }) as Address;
      const [signer] = await this.walletClient.getAddresses();
      if (!signer || signer.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(
          `Signature validation will fail: account owner is ${owner}, ` +
          `but the connected wallet is ${signer ?? "unknown"}. ` +
          `Please connect and sign with the owner wallet.`
        );
      }
    } catch (error) {
      // If we cannot determine the owner/signer, surface the error
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to verify owner/signature. Please connect with the owner wallet.");
    }

    // Check account balance before proposing
    try {
      const balance = await this.publicClient.getBalance({ address: this.accountAddress });
      // Warn if balance is very low (less than 0.001 ETH)
      if (balance < 1000000000000000n) { // 0.001 ETH
        console.warn(`Account balance is very low: ${balance.toString()} wei. This may cause transaction failures.`);
      }
    } catch (error) {
      // Balance check failed, but continue anyway
      console.warn("Failed to check account balance:", error);
    }

    // Check if amount ranges are configured
    try {
      const rangeCount = await this.getAmountRangeCount();
      if (rangeCount === 0n) {
        throw new Error(
          "No amount ranges configured. Please configure amount ranges using configureAmountRange() " +
          "before proposing transactions. Each transaction amount must fall within a configured range."
        );
      }

      // Try to get config for this amount to verify it's covered
      try {
        await this.getConfigForAmount(amount);
      } catch (error: any) {
        if (error?.message?.includes("NoConfigForAmount") || error?.message?.includes("No amount range")) {
          throw new Error(
            `No amount range configured for transaction amount ${amount.toString()} wei. ` +
            `Please configure an amount range that covers this amount using configureAmountRange().`
          );
        }
        // If it's a different error, continue (might be a network issue)
      }
    } catch (error) {
      // If it's our custom error, throw it
      if (error instanceof Error &&
        (error.message.includes("No amount range") || error.message.includes("NoConfigForAmount"))) {
        throw error;
      }
      // Otherwise, log and continue (might be a network issue)
      console.warn("Failed to verify amount range configuration:", error);
    }

    // Update bundler URL if provided
    if (bundlerUrl) {
      this.userOpBuilder.setBundlerUrl(bundlerUrl);
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
      let userOpHash: Hex;
      try {
        userOpHash = await this.userOpBuilder.submitToBundler(signedUserOp, bundlerUrl);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Bundler submission failed: ${msg}. ` +
          `Bundler URL: ${bundlerUrl || this.userOpBuilder["bundlerUrl"] || "unknown"}. ` +
          `No UserOp hash returned; the bundler rejected the request during validation.`
        );
      }

      // Wait for UserOperation to be included and get the actual transaction hash
      // The bundler returns a UserOperation hash, but we need the transaction hash
      const actualTxHash = await this.userOpBuilder.waitForUserOperationReceipt(
        userOpHash,
        bundlerUrl,
        120_000, // 2 minute timeout
        2_000    // Poll every 2 seconds
      );

      // Wait for the transaction to be confirmed and extract the internal txHash
      // from the TransactionProposed event emitted by MultiLevelAccount
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: actualTxHash as Hex,
        timeout: 60_000,
      });

      // First, check if the UserOp failed by looking for UserOperationRevertReason or failed UserOperationEvent
      let userOpFailed = false;
      let revertReason: string | null = null;
      let rawRevertData: string | null = null;

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
          continue;
        }

        let decoded:
          | { eventName: "UserOperationRevertReason"; args: { userOpHash: Hex; sender: string; revertReason: Hex } }
          | { eventName: "UserOperationEvent"; args: { userOpHash: Hex; sender: string; success: boolean } }
          | { eventName: string; args: Record<string, unknown> };

        try {
          decoded = decodeEventLog({
            abi: ENTRY_POINT_ABI,
            data: log.data,
            topics: log.topics,
          }) as unknown as typeof decoded;
        } catch {
          continue;
        }

        if (decoded.eventName === "UserOperationRevertReason") {
          const args = decoded.args as unknown as {
            userOpHash: Hex;
            sender: string;
            revertReason: Hex;
          };
          if (args.userOpHash.toLowerCase() !== (userOpHash as string).toLowerCase()) {
            continue;
          }
          const sender = args.sender;

          if (sender && sender.toLowerCase() === this.accountAddress.toLowerCase()) {
            userOpFailed = true;
            let reason: any = args.revertReason || "Unknown error";

            // Decode revert reason if it's bytes
            let reasonStr: string;
            if (reason && typeof reason === "object") {
              if ("data" in reason) {
                reason = (reason as any).data;
              }
              if (typeof reason === "string" && reason.startsWith("0x")) {
                try {
                  const hex = reason.slice(2);
                  const dataStart = hex.length > 8 ? 8 : 0;
                  const dataHex = hex.slice(dataStart);
                  const decodedUtf8 = Buffer.from(dataHex, "hex")
                    .toString("utf-8")
                    .replace(/\0/g, "")
                    .trim();
                  reasonStr = decodedUtf8 || reason;
                } catch {
                  reasonStr = reason;
                }
              } else {
                reasonStr = String(reason);
              }
            } else {
              reasonStr = typeof reason === "string" ? reason : String(reason);
            }

            rawRevertData = reasonStr;
            const reasonLower = reasonStr.toLowerCase();

            if (reasonStr === "0xab3d0d00" || reasonLower.includes("ab3d0d00") || reasonLower.includes("noconfigforamount")) {
              revertReason = "NoConfigForAmount: No amount range configured for this transaction amount. " +
                "Please configure amount ranges using configureAmountRange() before proposing transactions.";
            } else if (reasonLower.includes("prefund failed") ||
              reasonLower.includes("prefund") ||
              reasonLower.includes("insufficient") ||
              reasonLower.includes("balance") ||
              reasonLower.includes("not enough")) {
              try {
                const balance = await this.publicClient.getBalance({
                  address: this.accountAddress,
                  blockTag: 'latest'
                });
                const balanceEth = Number(balance) / 1e18;

                if (balanceEth < 0.001) {
                  revertReason = `Insufficient funds: Account has ${balance.toString()} wei (${balanceEth.toFixed(6)} ETH). ` +
                    `The account needs sufficient ETH to pay for gas fees (typically at least 0.001 ETH). ` +
                    `Please fund the account first using the "Fund Account" section.`;
                } else {
                  let decodedError = reasonStr;
                  if (reasonStr.startsWith("0x") && reasonStr.length > 2) {
                    try {
                      const decodedUtf8 = Buffer.from(reasonStr.slice(2), 'hex').toString('utf-8').replace(/\0/g, '').trim();
                      if (decodedUtf8 && decodedUtf8.length > 0 && /^[\x20-\x7E]+$/.test(decodedUtf8)) {
                        decodedError = decodedUtf8;
                      }
                    } catch {
                      // Keep original
                    }
                  }

                  revertReason = `Validation error: ${decodedError}. Account balance: ${balanceEth.toFixed(6)} ETH (sufficient). ` +
                    `This might be a gas estimation issue, EntryPoint validation problem, or signature validation failure. ` +
                    `Check the transaction on Etherscan for more details.`;
                }
              } catch {
                revertReason = "Prefund/validation error: " + reasonStr + ". " +
                  "Unable to check account balance. Please verify the account has sufficient funds and check Etherscan for details.";
              }
            } else if (reasonLower.includes("sig_validation_failed") ||
              reasonLower.includes("signature") ||
              reasonStr === "0x01" || reasonStr === "1") {
              revertReason = "Signature validation failed: The transaction was signed by the wrong account. " +
                "Make sure you're using the account owner's wallet to sign the transaction.";
            } else {
              if (reasonStr === "Unknown error" || reasonStr.toLowerCase().includes("unknown") || reasonStr.length < 10) {
                try {
                  const balance = await this.publicClient.getBalance({ address: this.accountAddress });
                  const balanceEth = Number(balance) / 1e18;
                  if (balanceEth < 0.001) {
                    revertReason = `Insufficient funds: Account has ${balance.toString()} wei (${balanceEth.toFixed(6)} ETH). ` +
                      `The account needs sufficient ETH to pay for gas fees (typically at least 0.001 ETH). ` +
                      `Please fund the account first using the "Fund Account" section.`;
                  } else {
                    revertReason = `${reasonStr} (Account balance: ${balanceEth.toFixed(6)} ETH)`;
                  }
                } catch {
                  revertReason = reasonStr;
                }
              } else {
                if (reasonStr.startsWith("0x") && reasonStr.length > 2) {
                  try {
                    const decodedUtf8 = Buffer.from(reasonStr.slice(2), 'hex').toString('utf-8').replace(/\0/g, '').trim();
                    if (decodedUtf8 && decodedUtf8.length > 0 && /^[\x20-\x7E]+$/.test(decodedUtf8)) {
                      revertReason = decodedUtf8;
                    } else {
                      revertReason = reasonStr;
                    }
                  } catch {
                    revertReason = reasonStr;
                  }
                } else {
                  revertReason = reasonStr;
                }
              }
            }

            break;
          }
        }

        if (decoded.eventName === "UserOperationEvent") {
          const args = decoded.args as unknown as {
            userOpHash: Hex;
            sender: string;
            success: boolean;
          };
          if (args.userOpHash.toLowerCase() !== (userOpHash as string).toLowerCase()) {
            continue;
          }
          const sender = args.sender;
          const success = args.success;

          if (sender && sender.toLowerCase() === this.accountAddress.toLowerCase()) {
            if (!success) {
              userOpFailed = true;
              revertReason = "UserOperation execution failed";
              break;
            }
          }
        }
      }

      // If UserOp failed, throw an error with details
      if (userOpFailed) {
        // If we still have a generic error, do a final balance check
        if (revertReason === null || revertReason === "Unknown error" || revertReason.toLowerCase().includes("unknown")) {
          try {
            const balance = await this.publicClient.getBalance({
              address: this.accountAddress,
              blockTag: 'latest'
            });
            const balanceEth = Number(balance) / 1e18;

            if (balanceEth < 0.001) {
              revertReason = `Insufficient funds: Account has ${balance.toString()} wei (${balanceEth.toFixed(6)} ETH). ` +
                `The account needs sufficient ETH to pay for gas fees (typically at least 0.001 ETH). ` +
                `Please fund the account first using the "Fund Account" section.`;
            } else {
              revertReason = `UserOperation failed with unknown error. Account balance: ${balanceEth.toFixed(6)} ETH. ` +
                `Check the transaction on Etherscan for more details.`;
            }
          } catch (balanceError) {
            console.warn("Failed to check balance for error diagnosis:", balanceError);
            revertReason = revertReason || "UserOperation failed. Check the transaction on Etherscan for details.";
          }
        }

        const errorMsg = revertReason !== null
          ? `UserOperation failed with revert reason: ${revertReason}. ` +
          `UserOp hash: ${userOpHash}. Tx hash: ${actualTxHash}. ` +
          (rawRevertData ? `Raw revert data: ${rawRevertData}. ` : "") +
          `Transaction was not proposed.`
          : `UserOperation failed. UserOp hash: ${userOpHash}. Tx hash: ${actualTxHash}. ` +
          (rawRevertData ? `Raw revert data: ${rawRevertData}. ` : "") +
          "Check the transaction on Etherscan for details.";
        throw new Error(errorMsg);
      }

      // Parse TransactionProposed event to get the internal transaction hash
      // This is the hash used by the MultiLevelAccount contract for tracking
      // Filter logs by account address to ensure we get the right event
      let internalTxHash: Hex | null = null;

      for (const log of receipt.logs) {
        // Only check logs from the account contract
        if (log.address.toLowerCase() !== this.accountAddress.toLowerCase()) {
          continue;
        }

        try {
          const decoded = decodeEventLog({
            abi: MULTI_LEVEL_ACCOUNT_ABI,
            eventName: "TransactionProposed",
            data: log.data,
            topics: log.topics,
          });

          // Return the internal transaction hash from the event
          const txHashFromEvent = (decoded.args as any).txHash as Hex;
          if (txHashFromEvent) {
            internalTxHash = txHashFromEvent;
            break; // Found it, no need to continue
          }
        } catch {
          // Not a TransactionProposed event, continue
          continue;
        }
      }

      // If we found the internal hash, return it
      if (internalTxHash) {
        return internalTxHash;
      }

      // If we didn't find it in the receipt logs, try querying events directly
      // This can happen with bundle transactions where logs might be in internal transactions
      try {
        const eventAbi = MULTI_LEVEL_ACCOUNT_ABI.find((e) =>
          e.type === "event" && (e as any).name === "TransactionProposed"
        ) as any;

        if (eventAbi) {
          const logs = await this.publicClient.getLogs({
            address: this.accountAddress,
            event: {
              type: "event",
              name: "TransactionProposed",
              inputs: eventAbi.inputs || []
            },
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
          });

          // Get the most recent TransactionProposed event from this block
          for (const log of logs.reverse()) {
            try {
              const decoded = decodeEventLog({
                abi: MULTI_LEVEL_ACCOUNT_ABI,
                eventName: "TransactionProposed",
                data: log.data,
                topics: log.topics,
              });

              const txHashFromEvent = (decoded.args as any).txHash as Hex;
              if (txHashFromEvent) {
                return txHashFromEvent;
              }
            } catch {
              continue;
            }
          }
        }
      } catch (queryError) {
        console.warn("Failed to query TransactionProposed events:", queryError);
      }

      // Last resort: throw an error instead of returning bundle hash
      // This forces the caller to handle the error properly
      throw new Error(
        `TransactionProposed event not found in transaction ${actualTxHash}. ` +
        `This usually means the UserOperation failed during validation or execution. ` +
        `Check the transaction on Etherscan for UserOperationRevertReason events. ` +
        `Common causes: invalid signature, insufficient funds, or account not configured.`
      );
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

  /**
   * Get amount range count
   */
  async getAmountRangeCount(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "getAmountRangeCount"
    }) as bigint;
  }

  /**
   * Get amount range at index
   */
  async getAmountRange(index: number): Promise<any> {
    return await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "getAmountRange",
      args: [BigInt(index)]
    });
  }

  /**
   * Get configuration for a specific amount
   */
  async getConfigForAmount(amount: bigint): Promise<any> {
    return await this.publicClient.readContract({
      address: this.accountAddress,
      abi: MULTI_LEVEL_ACCOUNT_ABI,
      functionName: "getConfigForAmount",
      args: [amount]
    });
  }

  /**
   * Get account diagnostics (balance, amount ranges, etc.)
   * Useful for debugging transaction proposal failures
   */
  async getAccountDiagnostics(): Promise<{
    balance: bigint;
    balanceEth: string;
    amountRangeCount: bigint;
    amountRanges: any[];
    owner: Address;
  }> {
    // Force fresh balance check (no caching)
    const balance = await this.publicClient.getBalance({
      address: this.accountAddress,
      blockTag: 'latest' // Ensure we get the latest balance
    });

    const [rangeCount, owner] = await Promise.all([
      this.getAmountRangeCount(),
      this.publicClient.readContract({
        address: this.accountAddress,
        abi: MULTI_LEVEL_ACCOUNT_ABI,
        functionName: "owner",
        blockTag: 'latest' // Ensure fresh data
      }) as Promise<Address>
    ]);

    const amountRanges: any[] = [];
    for (let i = 0; i < Number(rangeCount); i++) {
      try {
        const range = await this.getAmountRange(i);
        amountRanges.push(range);
      } catch {
        // Skip if range doesn't exist
      }
    }

    return {
      balance,
      balanceEth: (Number(balance) / 1e18).toFixed(6),
      amountRangeCount: rangeCount,
      amountRanges,
      owner
    };
  }
}
