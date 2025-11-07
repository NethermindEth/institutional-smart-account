export interface Transaction {
  to: string;
  value: bigint;
  data: string;
  amount: bigint;
  proposedAt: Date;
  config: AmountRange;
}

export interface AmountRange {
  minAmount: bigint;
  maxAmount: bigint;
  levelIds: bigint[];
  quorums: bigint[];
  timelocks: bigint[];
}

export interface TransactionStatus {
  txHash: string;
  to: string;
  value: bigint;
  amount: bigint;
  proposedAt: Date;
  currentLevelIndex: number;
  fullyApproved: boolean;
  levelStatuses: LevelStatus[];
}

export interface LevelStatus {
  levelId: number;
  submitted: boolean;
  approved: boolean;
  denied: boolean;
  signaturesCollected: number;
  signaturesRequired: number;
  timelockRemaining: number;
}

