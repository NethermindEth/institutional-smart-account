import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Skandha Bundler Setup Helper
 * 
 * This module provides utilities to start and stop the Skandha bundler
 * for integration testing with Etherspot's infrastructure.
 */

export interface SkandhaConfig {
  rpcUrl: string;
  entryPointAddress: string;
  chainId: number;
  port?: number;
}

let bundlerProcess: ChildProcess | null = null;

/**
 * Start Skandha bundler
 * 
 * @param config Bundler configuration
 * @param configPath Path to Skandha config.json file
 * @returns Promise that resolves when bundler is ready
 */
export async function startSkandhaBundler(
  config: SkandhaConfig,
  configPath?: string
): Promise<void> {
  if (bundlerProcess) {
    console.log("Bundler already running");
    return;
  }

  const configFile = configPath || path.join(__dirname, "skandha-config.json");
  
  // Create config file if it doesn't exist
  if (!fs.existsSync(configFile)) {
    await createSkandhaConfig(config, configFile);
  }

  console.log("Starting Skandha bundler...");
  console.log("Config file:", configFile);
  
  // Start bundler process
  // Skandha bundler is not available as npm package, so we need to:
  // 1. Try Docker (if available)
  // 2. Try running from cloned source (if available)
  // 3. Skip if neither is available
  
  let command: string;
  let args: string[];
  let useDocker = false;
  
  // Check if Docker is available
  try {
    const { execSync } = require("child_process");
    execSync("docker --version", { stdio: "ignore" });
    useDocker = true;
    console.log("Docker detected, will try to use Docker for Skandha bundler");
  } catch {
    console.log("Docker not available, will try to run Skandha from source");
  }
  
  if (useDocker) {
    // Try Docker approach
    command = "docker";
    args = [
      "run",
      "--rm",
      "-d",
      "--name", "skandha-bundler-test",
      "-p", `${config.port || 14337}:14337`,
      "--mount", `type=bind,source=${configFile},target=/usr/app/config.json,readonly`,
      "etherspot/skandha:latest",
      "standalone"
    ];
  } else {
    // Try to find Skandha in common locations or use a script
    // Check if there's a skandha directory in the project
    const skandhaPath = path.join(process.cwd(), "..", "skandha", "skandha");
    const fs = require("fs");
    
    if (fs.existsSync(skandhaPath)) {
      command = skandhaPath;
      args = ["standalone", "--config", configFile];
    } else {
      // If Skandha is not available, we'll skip bundler tests
      throw new Error(
        "Skandha bundler not found. Options:\n" +
        "1. Install Docker and use: docker pull etherspot/skandha:latest\n" +
        "2. Clone Skandha: git clone https://github.com/etherspot/skandha ../skandha && cd ../skandha && yarn build\n" +
        "3. Set SKIP_BUNDLER=1 to skip bundler tests"
      );
    }
  }
  
  console.log(`Starting bundler: ${command} ${args.join(" ")}`);
  
  bundlerProcess = spawn(command, args, {
    stdio: "pipe", // Use pipe instead of inherit to avoid cluttering test output
    shell: true,
    env: { ...process.env }
  });
  
  // Log bundler output for debugging
  bundlerProcess.stdout?.on("data", (data) => {
    if (process.env.DEBUG_BUNDLER) {
      console.log(`[Bundler] ${data.toString()}`);
    }
  });
  
  bundlerProcess.stderr?.on("data", (data) => {
    if (process.env.DEBUG_BUNDLER) {
      console.error(`[Bundler Error] ${data.toString()}`);
    }
  });

  bundlerProcess.on("error", (error) => {
    console.error("Failed to start bundler:", error);
    bundlerProcess = null;
  });

  bundlerProcess.on("exit", (code) => {
    console.log(`Bundler exited with code ${code}`);
    bundlerProcess = null;
  });

  // Wait for bundler to be ready
  const bundlerUrl = `http://localhost:${config.port || 14337}/rpc`;
  await waitForBundler(bundlerUrl, 30000); // 30 second timeout
  
  console.log("Bundler is ready at:", bundlerUrl);
}

/**
 * Stop Skandha bundler
 */
export function stopSkandhaBundler(): void {
  if (bundlerProcess) {
    console.log("Stopping Skandha bundler...");
    bundlerProcess.kill();
    bundlerProcess = null;
  }
  
  // Also try to stop Docker container if it exists
  try {
    const { execSync } = require("child_process");
    execSync("docker stop skandha-bundler-test 2>/dev/null || true", { stdio: "ignore" });
    execSync("docker rm skandha-bundler-test 2>/dev/null || true", { stdio: "ignore" });
  } catch {
    // Ignore errors - container might not exist
  }
}

/**
 * Create Skandha config file
 */
async function createSkandhaConfig(
  config: SkandhaConfig,
  configPath: string
): Promise<void> {
  const configData = {
    rpcUrl: config.rpcUrl,
    entryPoint: config.entryPointAddress,
    chainId: config.chainId,
    port: config.port || 14337,
    // Add other Skandha-specific config options as needed
  };

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  console.log("Created Skandha config at:", configPath);
}

/**
 * Wait for bundler to be ready
 */
async function waitForBundler(url: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: []
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (!result.error) {
          return; // Bundler is ready
        }
      }
    } catch (error) {
      // Bundler not ready yet, continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }
  
  throw new Error(`Bundler did not become ready within ${timeout}ms`);
}

/**
 * Check if bundler is running
 */
export async function isBundlerRunning(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: []
      })
    });
    
    const result = await response.json();
    return !result.error;
  } catch {
    return false;
  }
}

