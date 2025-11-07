import { Contract, Provider, Signer, getBytes } from "ethers";
import { PackedUserOperation } from "./types";
import { getUserOpHash } from "./utils/userOpHash";

export class UserOpBuilder {
  private account: Contract;
  private entryPoint: Contract;
  private provider: Provider;
  
  constructor(
    account: Contract,
    entryPoint: Contract,
    provider: Provider
  ) {
    this.account = account;
    this.entryPoint = entryPoint;
    this.provider = provider;
  }
  
  async buildUserOp(params: {
    to: string;
    value: bigint;
    data: string;
    amount: bigint;
  }): Promise<PackedUserOperation> {
    const nonce = await this.account.nonce();
    
    const callData = this.account.interface.encodeFunctionData('execute', [
      params.to,
      params.value,
      params.data,
      params.amount
    ]);
    
    // Estimate gas
    const [callGasLimit, verificationGasLimit] = await this._estimateGas(callData);
    
    const feeData = await this.provider.getFeeData();
    
    // Pack gas limits and fees
    const accountGasLimits = this._packAccountGasLimits(verificationGasLimit, callGasLimit);
    const gasFees = this._packGasFees(feeData.maxPriorityFeePerGas || 0n, feeData.maxFeePerGas || 0n);
    
    return {
      sender: await this.account.getAddress(),
      nonce,
      initCode: '0x',
      callData,
      accountGasLimits,
      preVerificationGas: 50000n,
      gasFees,
      paymasterAndData: '0x',
      signature: '0x'
    };
  }
  
  async signUserOp(
    userOp: PackedUserOperation,
    signer: Signer
  ): Promise<PackedUserOperation> {
    const chainId = (await this.provider.getNetwork()).chainId;
    const userOpHash = getUserOpHash(userOp, await this.entryPoint.getAddress(), chainId);
    
    const signature = await signer.signMessage(getBytes(userOpHash));
    
    return {
      ...userOp,
      signature
    };
  }
  
  private _packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): string {
    // Pack two uint128 values into bytes32 using zeroPadValue and concat
    const { zeroPadValue, toBeHex, concat } = require("ethers");
    const verificationGasLimitBytes = zeroPadValue(toBeHex(verificationGasLimit), 16);
    const callGasLimitBytes = zeroPadValue(toBeHex(callGasLimit), 16);
    return concat([verificationGasLimitBytes, callGasLimitBytes]);
  }
  
  private _packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): string {
    // Pack two uint128 values into bytes32 using zeroPadValue and concat
    const { zeroPadValue, toBeHex, concat } = require("ethers");
    const maxPriorityFeePerGasBytes = zeroPadValue(toBeHex(maxPriorityFeePerGas), 16);
    const maxFeePerGasBytes = zeroPadValue(toBeHex(maxFeePerGas), 16);
    return concat([maxPriorityFeePerGasBytes, maxFeePerGasBytes]);
  }
  
  private async _estimateGas(callData: string): Promise<[bigint, bigint]> {
    // Estimate gas limits
    // Simplified - in production would use actual estimation
    return [200000n, 200000n];
  }
}

