/**
 * Co-Signer Behavior Scenarios
 * 
 * This file defines how co-signers will behave in different test scenarios.
 * Each scenario specifies:
 * - Which signers will sign/deny
 * - Timing of their actions
 * - Expected outcomes
 * 
 * Format: Each scenario has a name, description, and behavior map
 */

import { ethers } from "hardhat";

export interface CoSignerBehavior {
  /** Signer address */
  signer: string;
  /** Action: 'sign' | 'deny' | 'abstain' */
  action: 'sign' | 'deny' | 'abstain';
  /** Delay in seconds before taking action (0 = immediate) */
  delaySeconds?: number;
  /** Condition for this action (optional) */
  condition?: (context: ScenarioContext) => boolean;
}

export interface ScenarioContext {
  txHash: string;
  amount: bigint;
  to: string;
  currentLevel: number;
  signaturesCollected: number;
  signaturesRequired: number;
}

export interface CoSignerScenario {
  /** Scenario name */
  name: string;
  /** Scenario description */
  description: string;
  /** Expected outcome */
  expectedOutcome: 'approved' | 'denied' | 'pending' | 'timeout';
  /** Behavior for each level */
  levels: {
    levelId: number;
    signers: CoSignerBehavior[];
  }[];
}

/**
 * Scenario 1: Happy Path - All Signers Approve
 * All signers at all levels approve the transaction
 */
export const SCENARIO_HAPPY_PATH: CoSignerScenario = {
  name: "Happy Path - All Approve",
  description: "All signers at all levels approve the transaction sequentially",
  expectedOutcome: 'approved',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'sign', delaySeconds: 10 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'sign', delaySeconds: 5 }
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'sign', delaySeconds: 0 }
      ]
    }
  ]
};

/**
 * Scenario 2: Early Denial - Level 1 Denies
 * First signer at level 1 denies, transaction should be cancelled
 */
export const SCENARIO_EARLY_DENIAL: CoSignerScenario = {
  name: "Early Denial - Level 1",
  description: "First signer at level 1 denies, transaction cancelled immediately",
  expectedOutcome: 'denied',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'deny', delaySeconds: 0 }
        // Other signers never get a chance to act
      ]
    }
  ]
};

/**
 * Scenario 3: Mid-Level Denial - Level 2 Denies After Level 1 Approves
 * Level 1 approves, but level 2 denies
 */
export const SCENARIO_MID_LEVEL_DENIAL: CoSignerScenario = {
  name: "Mid-Level Denial - Level 2",
  description: "Level 1 approves, but first signer at level 2 denies",
  expectedOutcome: 'denied',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'sign', delaySeconds: 10 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'deny', delaySeconds: 0 }
        // comp2 never gets a chance
      ]
    }
  ]
};

/**
 * Scenario 4: Late Denial - Level 3 Denies After Levels 1+2 Approve
 * Levels 1 and 2 approve, but level 3 denies
 */
export const SCENARIO_LATE_DENIAL: CoSignerScenario = {
  name: "Late Denial - Level 3",
  description: "Levels 1 and 2 approve, but level 3 denies",
  expectedOutcome: 'denied',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'sign', delaySeconds: 10 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'sign', delaySeconds: 5 }
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'deny', delaySeconds: 0 }
      ]
    }
  ]
};

/**
 * Scenario 5: Partial Quorum - Not Enough Signers
 * Some signers sign but quorum not reached (timeout scenario)
 */
export const SCENARIO_PARTIAL_QUORUM: CoSignerScenario = {
  name: "Partial Quorum - Timeout",
  description: "Some signers sign but quorum not reached, transaction times out",
  expectedOutcome: 'pending', // Will timeout
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 }
        // ops3 abstains - only 2/3 sign, but quorum is 3
      ]
    }
  ]
};

/**
 * Scenario 6: Conditional Approval - Amount-Based Behavior
 * Signers approve small amounts but deny large amounts
 */
export const SCENARIO_CONDITIONAL_APPROVAL: CoSignerScenario = {
  name: "Conditional Approval - Amount Based",
  description: "Signers approve small amounts but deny large amounts",
  expectedOutcome: 'approved', // For small amount
  levels: [
    {
      levelId: 1,
      signers: [
        {
          signer: 'ops1',
          action: 'sign',
          delaySeconds: 0,
          condition: (ctx) => ctx.amount < ethers.parseEther("10000")
        },
        {
          signer: 'ops1',
          action: 'deny',
          delaySeconds: 0,
          condition: (ctx) => ctx.amount >= ethers.parseEther("10000")
        },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'sign', delaySeconds: 10 }
      ]
    }
  ]
};

/**
 * Scenario 7: Sequential Slow Approval
 * All signers approve but with significant delays
 */
export const SCENARIO_SLOW_APPROVAL: CoSignerScenario = {
  name: "Sequential Slow Approval",
  description: "All signers approve but with significant delays between actions",
  expectedOutcome: 'approved',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 60 },
        { signer: 'ops3', action: 'sign', delaySeconds: 120 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'sign', delaySeconds: 60 }
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'sign', delaySeconds: 0 }
      ]
    }
  ]
};

/**
 * Scenario 8: Mixed Behavior - Some Sign, Some Abstain
 * Some signers sign, some abstain, but quorum is reached
 */
export const SCENARIO_MIXED_BEHAVIOR: CoSignerScenario = {
  name: "Mixed Behavior - Partial Participation",
  description: "Some signers sign, some abstain, but quorum is still reached",
  expectedOutcome: 'approved',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'abstain' } // Abstains but quorum (2/3) is met
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'abstain' } // Abstains but quorum (1/2) is met
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'sign', delaySeconds: 0 }
      ]
    }
  ]
};

/**
 * Scenario 9: Veto Power - Executive Denies After All Others Approve
 * All lower levels approve, but executive uses veto power
 */
export const SCENARIO_VETO_POWER: CoSignerScenario = {
  name: "Veto Power - Executive Denial",
  description: "All lower levels approve, but executive denies at final level",
  expectedOutcome: 'denied',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 5 },
        { signer: 'ops3', action: 'sign', delaySeconds: 10 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'sign', delaySeconds: 5 }
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'deny', delaySeconds: 0 } // Veto!
      ]
    }
  ]
};

/**
 * Scenario 10: Rapid Approval - All Sign Immediately
 * All signers approve immediately with no delays
 */
export const SCENARIO_RAPID_APPROVAL: CoSignerScenario = {
  name: "Rapid Approval - All Sign Immediately",
  description: "All signers approve immediately with no delays",
  expectedOutcome: 'approved',
  levels: [
    {
      levelId: 1,
      signers: [
        { signer: 'ops1', action: 'sign', delaySeconds: 0 },
        { signer: 'ops2', action: 'sign', delaySeconds: 0 },
        { signer: 'ops3', action: 'sign', delaySeconds: 0 }
      ]
    },
    {
      levelId: 2,
      signers: [
        { signer: 'comp1', action: 'sign', delaySeconds: 0 },
        { signer: 'comp2', action: 'sign', delaySeconds: 0 }
      ]
    },
    {
      levelId: 3,
      signers: [
        { signer: 'exec', action: 'sign', delaySeconds: 0 }
      ]
    }
  ]
};

/**
 * All available scenarios
 */
export const ALL_SCENARIOS: CoSignerScenario[] = [
  SCENARIO_HAPPY_PATH,
  SCENARIO_EARLY_DENIAL,
  SCENARIO_MID_LEVEL_DENIAL,
  SCENARIO_LATE_DENIAL,
  SCENARIO_PARTIAL_QUORUM,
  SCENARIO_CONDITIONAL_APPROVAL,
  SCENARIO_SLOW_APPROVAL,
  SCENARIO_MIXED_BEHAVIOR,
  SCENARIO_VETO_POWER,
  SCENARIO_RAPID_APPROVAL
];

/**
 * Get scenario by name
 */
export function getScenario(name: string): CoSignerScenario | undefined {
  return ALL_SCENARIOS.find(s => s.name === name);
}

/**
 * Map signer names to actual addresses
 * This will be populated with actual signer addresses from fixtures
 */
export interface SignerMap {
  ops1: string;
  ops2: string;
  ops3: string;
  comp1: string;
  comp2: string;
  exec: string;
}

