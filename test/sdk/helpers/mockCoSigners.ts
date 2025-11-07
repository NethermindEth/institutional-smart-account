/**
 * Mock Co-Signer Implementation
 * 
 * Simulates co-signer behavior based on scenarios
 */

import { Signer, Contract } from "ethers";
import { CoSignerScenario, CoSignerBehavior, ScenarioContext, SignerMap } from "../scenarios/coSignerBehaviors";

export class MockCoSigner {
  private signer: Signer;
  private level: Contract;
  private address: string;
  
  constructor(signer: Signer, level: Contract) {
    this.signer = signer;
    this.level = level;
  }
  
  async initialize() {
    this.address = await this.signer.getAddress();
  }
  
  /**
   * Execute behavior based on scenario
   */
  async executeBehavior(
    behavior: CoSignerBehavior,
    context: ScenarioContext,
    signerMap: SignerMap
  ): Promise<void> {
    // Check condition if present
    if (behavior.condition && !behavior.condition(context)) {
      return; // Condition not met, skip this behavior
    }
    
    // Wait for delay if specified
    if (behavior.delaySeconds && behavior.delaySeconds > 0) {
      await new Promise(resolve => setTimeout(resolve, behavior.delaySeconds * 1000));
    }
    
    // Execute action
    switch (behavior.action) {
      case 'sign':
        await this.level.connect(this.signer).sign(context.txHash);
        break;
      case 'deny':
        await this.level.connect(this.signer).deny(context.txHash);
        break;
      case 'abstain':
        // Do nothing
        break;
    }
  }
  
  getAddress(): string {
    return this.address;
  }
}

/**
 * Scenario Executor
 * Executes a co-signer scenario
 */
export class ScenarioExecutor {
  private signerMap: SignerMap;
  private levelContracts: Map<number, Contract>;
  
  constructor(signerMap: SignerMap, levelContracts: Map<number, Contract>) {
    this.signerMap = signerMap;
    this.levelContracts = levelContracts;
  }
  
  /**
   * Execute a scenario
   */
  async executeScenario(
    scenario: CoSignerScenario,
    txHash: string,
    amount: bigint,
    to: string
  ): Promise<void> {
    const context: ScenarioContext = {
      txHash,
      amount,
      to,
      currentLevel: 0,
      signaturesCollected: 0,
      signaturesRequired: 0
    };
    
    // Execute behaviors for each level sequentially
    for (const levelConfig of scenario.levels) {
      const level = this.levelContracts.get(levelConfig.levelId);
      if (!level) {
        throw new Error(`Level ${levelConfig.levelId} not found`);
      }
      
      context.currentLevel = levelConfig.levelId;
      
      // Execute behaviors for each signer at this level
      for (const behavior of levelConfig.signers) {
        // Get signer address from map
        const signerAddress = this.signerMap[behavior.signer as keyof SignerMap];
        if (!signerAddress) {
          throw new Error(`Signer ${behavior.signer} not found in map`);
        }
        
        // Get signer instance (we'll need to pass this in)
        // For now, we'll create a mock signer interface
        const mockSigner = new MockCoSigner(
          {} as Signer, // Will be replaced with actual signer
          level
        );
        
        await mockSigner.executeBehavior(behavior, context, this.signerMap);
      }
      
      // Wait for timelock if needed before proceeding to next level
      // This will be handled by the test
    }
  }
}

