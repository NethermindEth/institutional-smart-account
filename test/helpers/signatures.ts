import { ethers, Signer } from "ethers";

/**
 * Sign a message hash with ECDSA
 */
export async function signMessageHash(
  hash: string,
  signer: Signer
): Promise<string> {
  const messageHash = ethers.getBytes(hash);
  return await signer.signMessage(messageHash);
}

/**
 * Recover signer from signature
 */
export function recoverSigner(
  hash: string,
  signature: string
): string {
  return ethers.verifyMessage(ethers.getBytes(hash), signature);
}

