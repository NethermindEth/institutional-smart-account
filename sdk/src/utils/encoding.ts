import { AbiCoder } from "ethers";

export const abiCoder = AbiCoder.defaultAbiCoder();

export function encodeExecute(
  to: string,
  value: bigint,
  data: string,
  amount: bigint
): string {
  return abiCoder.encode(
    ["address", "uint256", "bytes", "uint256"],
    [to, value, data, amount]
  );
}

