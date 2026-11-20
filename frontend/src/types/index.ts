export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  kyc_status: string;
}

export interface Asset {
  id: string;
  type: string;
  name: string;
  details: any;
  instructions: string;
  nominee_id?: string;
  created_at?: string;
}

export interface Nominee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  relationship: string;
  key_share?: string | null;
  key_status?: 'ACTIVE' | 'DESTROYED';
  key_destroyed_at?: string | null;
  owner_name?: string;
  owner_email?: string;
  permissions: any;
  created_at?: string;
}

export interface BlockchainBlock {
  index: number;
  timestamp: string;
  claimId: string;
  stage: string;
  actor: string;
  contractAddress: string;
  dataHash: string;
  previousHash: string;
  blockHash: string;
  txHash: string;
}

export interface GateClaim {
  claimId: string;
  deceasedUserId: string;
  claimantId?: string;
  deceased_name?: string;
  deceased_email?: string;
  status:
    | 'PENDING_QUORUM'
    | 'VERIFICATION_IN_PROGRESS'
    | 'GRACE_PERIOD_ACTIVE'
    | 'HOLD_FOR_REVIEW'
    | 'DISPUTED'
    | 'ABORTED_LIVENESS'
    | 'REJECTED'
    | 'EXECUTED';
  quorumConfig: {
    requiredQuorum: number;
    totalNominees: number;
    nomineeIds: string[];
  };
  submittedShares: Array<{
    nomineeId: string;
    shareHash: string;
    submittedAt: string;
    maskedIdentifier: string;
  }>;
  certificateMetadata?: {
    registrationNumber: string;
    deceasedName: string;
    dateOfDeath: string;
    stateOrMunicipality: string;
    verificationUrl?: string;
    isGovDomainValid?: boolean;
    hasDigitalSignature?: boolean;
    signatureIntegrity?: string;
  };
  registryResult?: {
    status: string;
    mismatches: string[];
    provider: string;
    details?: string;
  };
  graceEndsAt?: string;
  gracePeriodSeconds: number;
  initiatedAt: string;
  updatedAt: string;
  executedAt?: string;
  holdReason?: string;
  abortReason?: string;
  disputeReason?: string;
  evidencePath?: string;
  keysDestroyed?: boolean;
  contractAddress?: string;
  executionTxHash?: string;
  blockchain?: {
    chainIntegrity: { valid: boolean; totalBlocks: number };
    blocks: BlockchainBlock[];
  };
  actions?: ClaimAction[];
}

export interface ClaimAction {
  id: string;
  claim_id: string;
  asset_id: string;
  asset_name?: string;
  asset_type?: string;
  action_type: string;
  status: string;
  encrypted_payload?: string;
  contract_address?: string;
  tx_hash?: string;
  result_notes?: string;
  executed_at?: string;
}

export interface DashboardData {
  user: User;
  assets_count: number;
  nominees_count: number;
  estate_completeness: number;
  recent_activity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

