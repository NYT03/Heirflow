import { z } from 'zod';

export type ClaimStatus =
  | 'PENDING_QUORUM'
  | 'VERIFICATION_IN_PROGRESS'
  | 'GRACE_PERIOD_ACTIVE'
  | 'HOLD_FOR_REVIEW'
  | 'DISPUTED'
  | 'ABORTED_LIVENESS'
  | 'REJECTED'
  | 'EXECUTED';

export interface DeathCertificateMetadata {
  registrationNumber: string;
  deceasedName: string;
  dateOfDeath: string; // ISO Date YYYY-MM-DD
  stateOrMunicipality: string;
  verificationUrl?: string;
  isGovDomainValid?: boolean;
  hasDigitalSignature?: boolean;
  signatureIntegrity?: 'VALID' | 'UNSIGNED' | 'MODIFIED_OR_TAMPERED';
  rawQrPayload?: string;
}

export interface PdfInspectionResult {
  isPdf: boolean;
  hasEmbeddedSignature: boolean;
  signatureIntegrity: 'VALID' | 'UNSIGNED' | 'MODIFIED_OR_TAMPERED';
  signatureDetails?: {
    signer?: string;
    signingTime?: string;
    subFilter?: string;
    byteRangeCount?: number;
  };
  tamperFlags: string[];
  recommendation: 'AUTO_APPROVE' | 'FLAG_FOR_MANUAL_REVIEW';
}

export interface RegistryQuery {
  registrationNumber: string;
  deceasedName: string;
  dateOfDeath: string;
  stateOrMunicipality?: string;
}

export interface RegistryRecord {
  registrationNumber: string;
  deceasedName: string;
  dateOfDeath: string;
  status: 'REGISTERED' | 'CANCELLED' | 'UNDER_INQUIRY';
  issuingAuthority: string;
  registrationDate?: string;
}

export type RegistryVerificationStatus =
  | 'VERIFIED'
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'PORTAL_UNAVAILABLE';

export interface RegistryVerificationResult {
  status: RegistryVerificationStatus;
  matchedRecord?: RegistryRecord;
  mismatches: string[];
  verifiedAt: Date;
  provider: string;
  details?: string;
}

export interface NomineeKeyShareSubmission {
  nomineeId: string;
  rawShare: string;
  timestamp?: Date;
}

export interface StoredNomineeShare {
  nomineeId: string;
  shareHash: string; // SHA-256 hash (never raw plain secret)
  submittedAt: Date;
  maskedIdentifier: string;
}

export interface QuorumConfig {
  requiredQuorum: number; // N
  totalNominees: number;   // M
  nomineeIds: string[];
}

export interface ClaimState {
  claimId: string;
  deceasedUserId: string;
  claimantId?: string;
  evidencePath?: string;
  status: ClaimStatus;
  quorumConfig: QuorumConfig;
  submittedShares: StoredNomineeShare[];
  certificateMetadata?: DeathCertificateMetadata;
  pdfInspection?: PdfInspectionResult;
  registryResult?: RegistryVerificationResult;
  graceEndsAt?: Date;
  gracePeriodSeconds: number;
  initiatedAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  holdReason?: string;
  abortReason?: string;
  disputeReason?: string;
}

export interface AuditLogEvent {
  id: string;
  correlationId: string;
  claimId?: string;
  eventType: string;
  timestamp: string;
  actor: string;
  payload: Record<string, unknown>;
}

// Zod Schemas for Runtime Validation
export const NomineeShareSubmissionSchema = z.object({
  nomineeId: z.string().min(1, 'nomineeId is required'),
  rawShare: z
    .string()
    .min(10, 'Key share must be at least 10 characters')
    .max(256, 'Key share too long')
    .regex(/^[A-Za-z0-9_-]+$/, 'Key share contains invalid characters'),
});

export const CertificateIngestionSchema = z.object({
  registrationNumber: z.string().min(3, 'Registration number is required'),
  deceasedName: z.string().min(2, 'Deceased name is required'),
  dateOfDeath: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of death must be YYYY-MM-DD'),
  stateOrMunicipality: z.string().min(2, 'State or municipal source is required'),
  qrPayload: z.string().optional(),
});

export const InitiateClaimSchema = z.object({
  deceasedUserId: z.string().min(1, 'deceasedUserId is required'),
  quorumConfig: z.object({
    requiredQuorum: z.number().int().min(1),
    totalNominees: z.number().int().min(1),
    nomineeIds: z.array(z.string()).min(1),
  }).refine((data) => data.requiredQuorum <= data.totalNominees, {
    message: 'requiredQuorum cannot exceed totalNominees',
  }),
  certificate: CertificateIngestionSchema,
  initialShare: NomineeShareSubmissionSchema.optional(),
  gracePeriodSeconds: z.number().int().positive().optional().default(604800), // 7 days
});

export const AbortClaimSchema = z.object({
  reason: z.string().min(3, 'Reason for abort is required'),
  initiator: z.string().min(1, 'Initiator identifier is required'),
  authProof: z.string().optional(),
});

export const DisputeClaimSchema = z.object({
  reason: z.string().min(3, 'Dispute reason is required'),
  disputantId: z.string().min(1, 'Disputant identifier is required'),
  contactEmail: z.string().email().optional(),
});

