/**
 * Hardhat Transport for Viem
 * 
 * Allows viem to use hardhat's provider directly without HTTP
 */

import type { Transport } from "viem";
import type { PublicClient } from "viem";
import { createPublicClient, custom, hexlify } from "viem";
import { hardhat } from "viem/chains";
import { ethers } from "hardhat";

/**
 * Create a custom transport that uses hardhat's provider
 * This allows viem to work with hardhat's in-process provider
 */
// Cache for contract interfaces to avoid recreating them
const contractInterfaceCache = new Map<string, ethers.Interface>();

export function hardhatTransport(): Transport {
  const provider = ethers.provider;
  
  return custom({
    request: async ({ method, params }) => {
      // Map viem RPC methods to ethers provider methods
      switch (method) {
        case "eth_blockNumber":
          return await provider.getBlockNumber();
        case "eth_getBalance":
          return await provider.getBalance(params[0] as string);
        case "eth_call":
          // eth_call returns raw hex data that viem will decode
          // ethers.call() returns the raw ABI-encoded result
          const callParams = params[0] as any;
          
          try {
            const callResult = await provider.call({
              to: callParams.to,
              data: callParams.data,
              blockTag: callParams.blockTag || "latest"
            } as any);
            
            // ethers returns BytesLike which could be string, Uint8Array, or ArrayLike<number>
            // Convert to hex string for viem - ensure it's always a proper hex string
            let hexResult: string;
            if (typeof callResult === "string") {
              hexResult = callResult.startsWith("0x") ? callResult : `0x${callResult}`;
            } else if (callResult instanceof Uint8Array) {
              hexResult = "0x" + Buffer.from(callResult).toString("hex");
            } else if (Array.isArray(callResult)) {
              hexResult = "0x" + Buffer.from(callResult).toString("hex");
            } else {
              // Fallback: use ethers to convert
              hexResult = ethers.hexlify(callResult);
            }
            
            // Ensure the result is a valid hex string
            // If it's empty or invalid, return "0x"
            if (!hexResult || hexResult === "0x") {
              return "0x";
            }
            
            return hexResult;
          } catch (error: any) {
            // If the call reverts, return "0x" (viem will handle the error)
            // Or return error data if available
            if (error.data) {
              return typeof error.data === "string" ? error.data : ethers.hexlify(error.data);
            }
            throw error;
          }
        case "eth_sendRawTransaction":
          return await provider.broadcastTransaction(params[0] as string);
        case "eth_getTransactionReceipt":
          const receipt = await provider.getTransactionReceipt(params[0] as string);
          return receipt ? {
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber.toString(),
            blockHash: receipt.blockHash,
            transactionIndex: receipt.index,
            from: receipt.from,
            to: receipt.to,
            gasUsed: receipt.gasUsed.toString(),
            cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
            effectiveGasPrice: receipt.gasPrice?.toString() || "0",
            contractAddress: receipt.contractAddress,
            logs: receipt.logs.map(log => ({
              address: log.address,
              topics: log.topics,
              data: log.data,
              blockNumber: log.blockNumber.toString(),
              blockHash: log.blockHash,
              transactionHash: log.transactionHash,
              transactionIndex: log.index.toString(),
              logIndex: log.index.toString(),
            })),
            status: receipt.status === 1 ? "0x1" : "0x0",
            logsBloom: receipt.logsBloom,
          } : null;
        case "eth_getLogs":
          const logs = await provider.getLogs({
            address: params[0].address,
            fromBlock: params[0].fromBlock,
            toBlock: params[0].toBlock,
            topics: params[0].topics,
          } as any);
          return logs.map(log => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: log.blockNumber.toString(),
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            transactionIndex: log.index.toString(),
            logIndex: log.index.toString(),
          }));
        case "eth_chainId":
          const network = await provider.getNetwork();
          return network.chainId.toString();
        case "eth_getCode":
          return await provider.getCode(params[0] as string);
        case "eth_estimateGas":
          return await provider.estimateGas(params[0] as any);
        case "eth_getTransactionCount":
          return await provider.getTransactionCount(params[0] as string, params[1] as string);
        case "eth_gasPrice":
          return await provider.getFeeData().then(fee => fee.gasPrice?.toString() || "0");
        case "eth_getTransactionByHash":
          const txByHash = await provider.getTransaction(params[0] as string);
          return txByHash ? {
            hash: txByHash.hash,
            blockNumber: txByHash.blockNumber?.toString(),
            blockHash: txByHash.blockHash,
            transactionIndex: txByHash.index?.toString(),
            from: txByHash.from,
            to: txByHash.to,
            value: txByHash.value.toString(),
            gasPrice: txByHash.gasPrice?.toString() || "0",
            gas: txByHash.gasLimit.toString(),
            input: txByHash.data,
            nonce: txByHash.nonce.toString(),
          } : null;
        case "eth_getBlockByHash":
          const blockByHash = await provider.getBlock(params[0] as string, params[1] as boolean);
          return blockByHash ? {
            number: blockByHash.number.toString(),
            hash: blockByHash.hash,
            parentHash: blockByHash.parentHash,
            timestamp: blockByHash.timestamp.toString(),
            gasLimit: blockByHash.gasLimit.toString(),
            gasUsed: blockByHash.gasUsed.toString(),
            miner: blockByHash.miner,
            transactions: params[1] ? blockByHash.transactions : blockByHash.transactions.map(tx => typeof tx === "string" ? tx : tx.hash),
          } : null;
        case "eth_getBlockByNumber":
          const block = await provider.getBlock(params[0] as string, params[1] as boolean);
          return block ? {
            number: block.number.toString(),
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp.toString(),
            gasLimit: block.gasLimit.toString(),
            gasUsed: block.gasUsed.toString(),
            miner: block.miner,
            transactions: params[1] ? block.transactions : block.transactions.map(tx => typeof tx === "string" ? tx : tx.hash),
          } : null;
        case "personal_sign":
          // personal_sign(message, address) - sign message with account
          // This is used by WalletClient for signing
          // We need to get the signer for the address and sign
          const message = params[0] as string;
          const signerAddress = params[1] as string;
          const signer = await ethers.getSigner(signerAddress);
          // Remove 0x prefix if present and convert to bytes
          const messageBytes = message.startsWith("0x") ? message.slice(2) : message;
          const signature = await signer.signMessage(ethers.getBytes("0x" + messageBytes));
          return signature;
        case "eth_sign":
          // eth_sign(address, messageHash) - legacy signing method
          const ethSignAddress = params[0] as string;
          const ethSignMessage = params[1] as string;
          const ethSigner = await ethers.getSigner(ethSignAddress);
          const ethSignature = await ethSigner.signMessage(ethers.getBytes(ethSignMessage));
          return ethSignature;
        case "eth_sendTransaction":
          // eth_sendTransaction(transaction) - send transaction
          const txParams = params[0] as any;
          const txSigner = await ethers.getSigner(txParams.from);
          const tx = await txSigner.sendTransaction({
            to: txParams.to,
            value: txParams.value ? BigInt(txParams.value) : undefined,
            data: txParams.data,
            gasLimit: txParams.gas ? BigInt(txParams.gas) : undefined,
            gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice) : undefined,
            maxFeePerGas: txParams.maxFeePerGas ? BigInt(txParams.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: txParams.maxPriorityFeePerGas ? BigInt(txParams.maxPriorityFeePerGas) : undefined,
            nonce: txParams.nonce ? Number(txParams.nonce) : undefined,
          });
          return tx.hash;
        default:
          // For methods not explicitly handled, try to call provider directly
          // This is a fallback for methods we haven't implemented
          throw new Error(`Method ${method} not implemented in hardhat transport`);
      }
    },
  });
}

/**
 * Create viem PublicClient using hardhat's provider
 */
export function createHardhatPublicClient(): PublicClient {
  return createPublicClient({
    chain: hardhat,
    transport: hardhatTransport(),
  });
}

