// Contract addresses for different networks
export const ENTRY_POINT_ADDRESSES: Record<string, string> = {
  mainnet: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  sepolia: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  base: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  baseSepolia: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  arbitrum: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  optimism: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
};

export function getEntryPointAddress(chainId: number): string {
  const chainIdMap: Record<number, string> = {
    1: ENTRY_POINT_ADDRESSES.mainnet,
    11155111: ENTRY_POINT_ADDRESSES.sepolia,
    8453: ENTRY_POINT_ADDRESSES.base,
    84532: ENTRY_POINT_ADDRESSES.baseSepolia,
    42161: ENTRY_POINT_ADDRESSES.arbitrum,
    10: ENTRY_POINT_ADDRESSES.optimism,
  };
  
  return chainIdMap[chainId] || ENTRY_POINT_ADDRESSES.mainnet;
}

