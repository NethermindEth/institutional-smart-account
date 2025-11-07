import { ethers, Signer } from "ethers";

export interface PackedUserOperation {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;  // Packed: verificationGasLimit (uint128) + callGasLimit (uint128)
  preVerificationGas: bigint;
  gasFees: string;  // Packed: maxPriorityFeePerGas (uint128) + maxFeePerGas (uint128)
  paymasterAndData: string;
  signature: string;
}

export function createUserOp(params: {
  sender: string;
  nonce: bigint;
  callData: string;
  signature?: string;
}): PackedUserOperation {
  const callGasLimit = 200000n;
  const verificationGasLimit = 200000n;
  const maxFeePerGas = ethers.parseUnits("10", "gwei");
  const maxPriorityFeePerGas = ethers.parseUnits("1", "gwei");
  
  // Pack accountGasLimits (verificationGasLimit, callGasLimit) as bytes32
  // Pack two uint128 values into 32 bytes: first 16 bytes = verificationGasLimit, last 16 bytes = callGasLimit
  const verificationGasLimitBytes = ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16);
  const callGasLimitBytes = ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16);
  const accountGasLimits = ethers.concat([verificationGasLimitBytes, callGasLimitBytes]);
  
  // Pack gasFees (maxPriorityFeePerGas, maxFeePerGas) as bytes32
  const maxPriorityFeePerGasBytes = ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16);
  const maxFeePerGasBytes = ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16);
  const gasFees = ethers.concat([maxPriorityFeePerGasBytes, maxFeePerGasBytes]);
  
  return {
    sender: params.sender,
    nonce: params.nonce,
    initCode: "0x",
    callData: params.callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 50000n,
    gasFees: gasFees,
    paymasterAndData: "0x",
    signature: params.signature || "0x"
  };
}

export async function signUserOp(
  userOp: PackedUserOperation,
  signer: Signer,
  entryPoint: string,
  chainId: bigint
): Promise<string> {
  const userOpHash = getUserOpHash(userOp, entryPoint, chainId);
  const signature = await signer.signMessage(ethers.getBytes(userOpHash));
  return signature;
}

export function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: string,
  chainId: bigint
): string {
  // Match MockEntryPoint's getUserOpHash which uses abi.encodePacked
  // This matches the simplified hash used in MockEntryPoint for testing
  const packed = ethers.solidityPacked(
    [
      "address", "uint256", "bytes32", "bytes32",
      "bytes32", "uint256", "bytes32", "bytes32",
      "address", "uint256"
    ],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      ethers.keccak256(userOp.paymasterAndData),
      entryPoint,
      chainId
    ]
  );
  
  return ethers.keccak256(packed);
}

