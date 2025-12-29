import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-chai-matchers";
import "hardhat-coverage";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import * as dotenv from "dotenv";

// Load .env file
dotenv.config();

const config: HardhatUserConfig & { coverage?: unknown } = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.23",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 11155111,
      forking: {
        url: "https://rpc.ankr.com/eth_sepolia/2c3a543973e2b935be5e6d4b080d7f95b50b2ce0fc4f1bb651d7d95be33072ae",
        enabled: true,
      },
    },
    localhost: {
      url: "http://localhost:8545",
      chainId: 11155111,
      // Default Anvil test key (same one used by Pimlico's docker guide)
      accounts: [
        "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
      ],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    base: {
      url: process.env.BASE_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161,
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 10,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || "",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    gasPrice: 20, // gwei
    outputFile: "gas-report.txt",
    noColors: false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    token: "ETH",
    excludeContracts: ["MockEntryPoint", "MaliciousReentrancy"],
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
    only: [],
    except: ["MockEntryPoint", "MaliciousReentrancy"],
  },
  coverage: {
    enabled: true,
    runs: 200,
    url: "http://127.0.0.1:8545",
    clean: true,
    cleanOnShutdown: true,
    providerOptions: {
      default_balance_ether: "10000",
      total_accounts: 20,
    },
    skipFiles: [
      "test/",
      "interfaces/",
      "libraries/",
      "MockEntryPoint.sol",
      "MaliciousReentrancy.sol",
    ],
    instrumenterOptions: {
      solcoverjs: {
        measureStatementCoverage: true,
        measureFunctionCoverage: true,
        measureBranchCoverage: true,
        measureLineCoverage: true,
      },
    },
  },
};

export default config;

