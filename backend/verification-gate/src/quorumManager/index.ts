import crypto from 'crypto';
import {
  ClaimState,
  NomineeKeyShareSubmission,
  NomineeShareSubmissionSchema,
  QuorumConfig,
  StoredNomineeShare,
} from '../types/index.js';
import { globalAuditLogger, maskIdentifier, maskKeyShare } from '../auditLogger/index.js';

export interface SubmitShareResult {
  success: boolean;
  quorumReached: boolean;
  sharesCollected: number;
  requiredQuorum: number;
  claimState: ClaimState;
  error?: string;
}

export class QuorumManager {
  /**
   * Hashes a raw cryptographic key share with SHA-256 for non-reversible integrity verification.
   * Raw secret bytes are NEVER logged or stored.
   */
  public static hashShare(rawShare: string): string {
    return crypto.createHash('sha256').update(rawShare.trim()).digest('hex');
  }

  /**
   * Validates and records an incoming nominee key share against a claim's quorum configuration.
   */
  public static submitShare(
    claimState: ClaimState,
    submission: NomineeKeyShareSubmission,
    correlationId?: string
  ): SubmitShareResult {
    // 1. Zod schema validation
    const parsed = NomineeShareSubmissionSchema.safeParse(submission);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors.map((e) => e.message).join('; ');
      globalAuditLogger.logEvent('SHARE_SUBMISSION_REJECTED', {
        correlationId,
        claimId: claimState.claimId,
        actor: submission.nomineeId,
        payload: { reason: errorMsg },
      });
      return {
        success: false,
        quorumReached: false,
        sharesCollected: claimState.submittedShares.length,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        claimState,
        error: errorMsg,
      };
    }

    const { nomineeId, rawShare } = parsed.data;

    // 2. State verification: cannot submit shares to aborted or executed claims
    if (
      claimState.status === 'ABORTED_LIVENESS' ||
      claimState.status === 'REJECTED' ||
      claimState.status === 'EXECUTED'
    ) {
      const errorMsg = `Cannot submit key share: claim is in terminal state '${claimState.status}'.`;
      return {
        success: false,
        quorumReached: false,
        sharesCollected: claimState.submittedShares.length,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        claimState,
        error: errorMsg,
      };
    }

    // 3. Authorization check: Nominee must be in configured list
    if (!claimState.quorumConfig.nomineeIds.includes(nomineeId)) {
      const errorMsg = `Nominee '${nomineeId}' is not authorized in this estate's nominee roster.`;
      globalAuditLogger.logEvent('UNAUTHORIZED_NOMINEE_SHARE_ATTEMPT', {
        correlationId,
        claimId: claimState.claimId,
        actor: nomineeId,
        payload: { reason: 'Nominee not registered in quorum roster' },
      });
      return {
        success: false,
        quorumReached: false,
        sharesCollected: claimState.submittedShares.length,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        claimState,
        error: errorMsg,
      };
    }

    // 4. Duplicate submission check for the same nominee
    const alreadySubmitted = claimState.submittedShares.some((s) => s.nomineeId === nomineeId);
    if (alreadySubmitted) {
      const errorMsg = `Nominee '${nomineeId}' has already submitted a key share for this claim.`;
      return {
        success: false,
        quorumReached: false,
        sharesCollected: claimState.submittedShares.length,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        claimState,
        error: errorMsg,
      };
    }

    // 5. Duplicate share collision check (prevent reuse of identical shares)
    const shareHash = this.hashShare(rawShare);
    const hashCollision = claimState.submittedShares.some((s) => s.shareHash === shareHash);
    if (hashCollision) {
      const errorMsg = 'This cryptographic key share has already been recorded by another submission.';
      return {
        success: false,
        quorumReached: false,
        sharesCollected: claimState.submittedShares.length,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        claimState,
        error: errorMsg,
      };
    }

    // 6. Record sanitized share
    const storedShare: StoredNomineeShare = {
      nomineeId,
      shareHash,
      submittedAt: new Date(),
      maskedIdentifier: maskIdentifier(nomineeId),
    };

    claimState.submittedShares.push(storedShare);
    claimState.updatedAt = new Date();

    const sharesCount = claimState.submittedShares.length;
    const quorumReached = sharesCount >= claimState.quorumConfig.requiredQuorum;

    globalAuditLogger.logEvent('NOMINEE_SHARE_RECORDED', {
      correlationId,
      claimId: claimState.claimId,
      actor: nomineeId,
      payload: {
        sharesCollected: sharesCount,
        requiredQuorum: claimState.quorumConfig.requiredQuorum,
        maskedShare: maskKeyShare(rawShare),
        quorumReached,
      },
    });

    // 7. Transition state when quorum is met
    if (quorumReached && claimState.status === 'PENDING_QUORUM') {
      claimState.status = 'VERIFICATION_IN_PROGRESS';
      globalAuditLogger.logEvent('QUORUM_REACHED', {
        correlationId,
        claimId: claimState.claimId,
        payload: {
          collected: sharesCount,
          required: claimState.quorumConfig.requiredQuorum,
          newStatus: claimState.status,
        },
      });
    }

    return {
      success: true,
      quorumReached,
      sharesCollected: sharesCount,
      requiredQuorum: claimState.quorumConfig.requiredQuorum,
      claimState,
    };
  }

  /**
   * Evaluates if a given claim has met its configured quorum
   */
  public static isQuorumMet(claimState: ClaimState): boolean {
    return claimState.submittedShares.length >= claimState.quorumConfig.requiredQuorum;
  }
}

