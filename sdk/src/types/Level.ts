export interface ApprovalState {
  submitted: boolean;
  requiredQuorum: bigint;
  signatureCount: bigint;
  timelockDuration: bigint;
  timelockEnd: bigint;
  approved: boolean;
  denied: boolean;
}

export interface SignatureProgress {
  current: bigint;
  required: bigint;
}

export interface PendingTransaction {
  txHash: string;
  to: string;
  value: bigint;
  data: string;
  amount: bigint;
  signaturesCollected: number;
  signaturesRequired: number;
  timelockRemaining: number;
}

