import { solidityPacked, keccak256 } from "ethers";
import { PackedUserOperation } from "../types";

export function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: string,
  chainId: bigint
): string {
  // Match the hash calculation used in MockEntryPoint and test helpers
  const packed = solidityPacked(
    [
      "address", "uint256", "bytes32", "bytes32",
      "bytes32", "uint256", "bytes32", "bytes32",
      "address", "uint256"
    ],
    [
      userOp.sender,
      userOp.nonce,
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      keccak256(userOp.paymasterAndData),
      entryPoint,
      chainId
    ]
  );
  
  return keccak256(packed);
}

