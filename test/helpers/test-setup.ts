/**
 * Test Setup Helper
 * 
 * Sets up test environment including:
 * - Starting Skandha bundler (if needed)
 * - Deploying EntryPoint
 * - Configuring test environment
 */

import { startSkandhaBundler, stopSkandhaBundler, isBundlerRunning } from "./skandha-setup";
import { ethers } from "hardhat";
import * as path from "path";

let bundlerStarted = false;
let entryPointAddress: string | null = null;

/**
 * Setup test environment
 * This should be called in a before() hook at the top level of test files
 */
export async function setupTestEnvironment(): Promise<{
  bundlerUrl: string | null;
  entryPointAddress: string;
  bundlerAvailable: boolean;
}> {
  const bundlerUrl = process.env.SKANDHA_BUNDLER_URL || "http://localhost:14337/rpc";
  let bundlerAvailable = false;
  
  // Check if bundler is already running
  const bundlerRunning = await isBundlerRunning(bundlerUrl);
  
  if (!bundlerRunning && !process.env.SKIP_BUNDLER) {
    console.log("Starting Skandha bundler for tests...");
    console.log("Note: If bundler fails to start, set SKIP_BUNDLER=1 to skip bundler tests");
    
    // Get hardhat network config
    const hre = require("hardhat");
    const networkConfig = hre.network.config;
    const chainId = networkConfig.chainId || 31337;
    
    // Get RPC URL from hardhat provider
    const provider = hre.network.provider;
    const rpcUrl = (provider as any)._httpProviderUrl || "http://localhost:8545";
    
    // Deploy EntryPoint if not already deployed
    if (!entryPointAddress) {
      try {
        const EntryPointFactory = await ethers.getContractFactory(
          "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint"
        );
        const entryPoint = await EntryPointFactory.deploy();
        await entryPoint.waitForDeployment();
        entryPointAddress = await entryPoint.getAddress();
        console.log("Deployed EntryPoint at:", entryPointAddress);
      } catch (error) {
        console.warn("Could not deploy EntryPoint, using MockEntryPoint:", error);
        // Use MockEntryPoint as fallback
        const MockEntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
        const mockEntryPoint = await MockEntryPointFactory.deploy();
        await mockEntryPoint.waitForDeployment();
        entryPointAddress = await mockEntryPoint.getAddress();
      }
    }
    
    // Start bundler
    try {
      const configPath = path.join(__dirname, "skandha-config.json");
      await startSkandhaBundler(
        {
          rpcUrl,
          entryPointAddress,
          chainId,
          port: 14337
        },
        configPath
      );
      
      bundlerStarted = true;
      console.log("Bundler started successfully");
      bundlerAvailable = true;
    } catch (error: any) {
      console.warn("Failed to start bundler:", error?.message || error);
      console.warn("\nBundler setup options:");
      console.warn("1. Use Docker: docker pull etherspot/skandha:latest");
      console.warn("2. Clone from source: git clone https://github.com/etherspot/skandha ../skandha");
      console.warn("3. Set SKIP_BUNDLER=1 to skip bundler tests");
      console.warn("\nBundler tests will be skipped.");
      // Don't throw - allow tests to continue without bundler
      bundlerAvailable = false;
    }
  } else if (bundlerRunning) {
    console.log("Bundler already running at:", bundlerUrl);
    bundlerAvailable = true;
  } else if (process.env.SKIP_BUNDLER) {
    console.log("SKIP_BUNDLER set - bundler tests will be skipped.");
    bundlerAvailable = false;
  }
  
  // If EntryPoint not set, try to get from env or deploy
  if (!entryPointAddress) {
    entryPointAddress = process.env.ENTRYPOINT_ADDRESS || null;
    
    if (!entryPointAddress) {
      // Deploy EntryPoint
      try {
        const EntryPointFactory = await ethers.getContractFactory(
          "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint"
        );
        const entryPoint = await EntryPointFactory.deploy();
        await entryPoint.waitForDeployment();
        entryPointAddress = await entryPoint.getAddress();
        console.log("Deployed EntryPoint at:", entryPointAddress);
      } catch (error) {
        console.warn("Could not deploy EntryPoint, using MockEntryPoint:", error);
        const MockEntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
        const mockEntryPoint = await MockEntryPointFactory.deploy();
        await mockEntryPoint.waitForDeployment();
        entryPointAddress = await mockEntryPoint.getAddress();
      }
    }
  }
  
  return {
    bundlerUrl: bundlerAvailable ? bundlerUrl : null,
    entryPointAddress: entryPointAddress!,
    bundlerAvailable
  };
}

/**
 * Teardown test environment
 * This should be called in an after() hook at the top level of test files
 */
export async function teardownTestEnvironment(): Promise<void> {
  if (bundlerStarted && !process.env.KEEP_BUNDLER_RUNNING) {
    console.log("Stopping Skandha bundler...");
    stopSkandhaBundler();
    bundlerStarted = false;
  }
}

/**
 * Get EntryPoint address (deploy if needed)
 */
export async function getEntryPointAddress(): Promise<string> {
  if (entryPointAddress) {
    return entryPointAddress;
  }
  
  // Deploy EntryPoint
  try {
    const EntryPointFactory = await ethers.getContractFactory(
      "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint"
    );
    const entryPoint = await EntryPointFactory.deploy();
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();
    return entryPointAddress;
  } catch (error) {
    // Fallback to MockEntryPoint
    const MockEntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
    const mockEntryPoint = await MockEntryPointFactory.deploy();
    await mockEntryPoint.waitForDeployment();
    entryPointAddress = await mockEntryPoint.getAddress();
    return entryPointAddress;
  }
}

