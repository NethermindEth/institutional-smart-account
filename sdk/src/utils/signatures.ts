import { Signer, verifyMessage, getBytes } from "ethers";

export async function signMessageHash(
  hash: string,
  signer: Signer
): Promise<string> {
  const messageHash = getBytes(hash);
  return await signer.signMessage(messageHash);
}

export function recoverSigner(
  hash: string,
  signature: string
): string {
  return verifyMessage(getBytes(hash), signature);
}

