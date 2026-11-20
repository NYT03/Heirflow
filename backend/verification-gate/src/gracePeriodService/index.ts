import { ClaimState } from '../types/index.js';
import { globalAuditLogger, maskIdentifier } from '../auditLogger/index.js';

export interface GracePeriodResult {
  success: boolean;
  status: ClaimState['status'];
  graceEndsAt?: Date;
  secondsRemaining?: number;
  message: string;
}

export class GracePeriodService {
  /**
   * Activates the mandatory grace period once quorum and registry verifications succeed.
   */
  public static activateGracePeriod(
    claimState: ClaimState,
    correlationId?: string
  ): GracePeriodResult {
    // Safety check: Cannot activate if liveness abort was triggered or claim is disputed
    if (claimState.status === 'ABORTED_LIVENESS') {
      return {
        success: false,
        status: claimState.status,
        message: 'Cannot start grace period: Claim was halted by a User Liveness Abort.',
      };
    }

    if (claimState.status === 'DISPUTED') {
      return {
        success: false,
        status: claimState.status,
        message: 'Cannot start grace period: Claim is currently under legal/family dispute.',
      };
    }

    const now = new Date();
    const durationSeconds = claimState.gracePeriodSeconds || 604800; // default 7 days
    const graceEndsAt = new Date(now.getTime() + durationSeconds * 1000);

    claimState.status = 'GRACE_PERIOD_ACTIVE';
    claimState.graceEndsAt = graceEndsAt;
    claimState.updatedAt = now;

    globalAuditLogger.logEvent('GRACE_PERIOD_ACTIVATED', {
      correlationId,
      claimId: claimState.claimId,
      payload: {
        durationSeconds,
        graceEndsAt: graceEndsAt.toISOString(),
        quorumCount: claimState.submittedShares.length,
      },
    });

    return {
      success: true,
      status: claimState.status,
      graceEndsAt,
      secondsRemaining: durationSeconds,
      message: `Grace period activated. Execution unlocked in ${durationSeconds} seconds (${(
        durationSeconds / 86400
      ).toFixed(1)} days).`,
    };
  }

  /**
   * Puts a claim on hold for manual escalated review
   * (e.g. When PDF signature is altered or registry has minor discrepancies)
   */
  public static holdForReview(
    claimState: ClaimState,
    reason: string,
    correlationId?: string
  ): GracePeriodResult {
    claimState.status = 'HOLD_FOR_REVIEW';
    claimState.holdReason = reason;
    claimState.graceEndsAt = undefined;
    claimState.updatedAt = new Date();

    globalAuditLogger.logEvent('CLAIM_HELD_FOR_REVIEW', {
      correlationId,
      claimId: claimState.claimId,
      payload: { reason },
    });

    return {
      success: true,
      status: claimState.status,
      message: `Claim flagged for manual administrative review: ${reason}`,
    };
  }

  /**
   * Critical Security Barrier: Living User Abort Signal
   * Simulates or executes the living owner halting an unauthorized / false death claim.
   * Immediately transitions to ABORTED_LIVENESS and terminates execution permanently.
   */
  public static triggerLivenessAbort(
    claimState: ClaimState,
    reason: string,
    initiator: string,
    correlationId?: string
  ): GracePeriodResult {
    const now = new Date();
    claimState.status = 'ABORTED_LIVENESS';
    claimState.abortReason = reason;
    claimState.graceEndsAt = undefined;
    claimState.updatedAt = now;

    globalAuditLogger.logEvent('LIVENESS_ABORT_TRIGGERED', {
      correlationId,
      claimId: claimState.claimId,
      actor: initiator,
      payload: {
        reason,
        action: 'EMERGENCY_HALT_ALL_EXECUTIONS',
        initiatorMasked: maskIdentifier(initiator),
        invalidatedShares: claimState.submittedShares.length,
      },
    });

    console.warn(
      `🚨 [SECURITY ALERT] Liveness Abort received for claim '${claimState.claimId}'! Estate owner verified alive. Reason: ${reason}`
    );

    return {
      success: true,
      status: claimState.status,
      message: 'CRITICAL: Claim aborted. Estate owner confirmed alive. All asset handover actions revoked.',
    };
  }

  /**
   * Objection / Dispute Hook
   * Pauses the grace period if family or legal representative raises an objection.
   */
  public static raiseDispute(
    claimState: ClaimState,
    reason: string,
    disputantId: string,
    correlationId?: string
  ): GracePeriodResult {
    const now = new Date();
    claimState.status = 'DISPUTED';
    claimState.disputeReason = reason;
    claimState.graceEndsAt = undefined; // Freeze timer
    claimState.updatedAt = now;

    globalAuditLogger.logEvent('DISPUTE_RAISED', {
      correlationId,
      claimId: claimState.claimId,
      actor: disputantId,
      payload: {
        reason,
        disputantMasked: maskIdentifier(disputantId),
      },
    });

    return {
      success: true,
      status: claimState.status,
      message: 'Claim disputed. Automatic execution paused pending legal review.',
    };
  }

  /**
   * Evaluates if the active grace period has concluded without disputes or aborts
   */
  public static isGracePeriodComplete(claimState: ClaimState): boolean {
    if (claimState.status !== 'GRACE_PERIOD_ACTIVE' || !claimState.graceEndsAt) {
      return false;
    }
    return Date.now() >= claimState.graceEndsAt.getTime();
  }

  /**
   * Finalizes execution ONLY if claim is in GRACE_PERIOD_ACTIVE and the grace timer has elapsed.
   */
  public static executeAfterGracePeriod(
    claimState: ClaimState,
    actor: string,
    correlationId?: string
  ): GracePeriodResult {
    if (claimState.status !== 'GRACE_PERIOD_ACTIVE') {
      return {
        success: false,
        status: claimState.status,
        message: `Cannot execute claim in status '${claimState.status}'. Must be 'GRACE_PERIOD_ACTIVE'.`,
      };
    }

    if (!claimState.graceEndsAt) {
      return {
        success: false,
        status: claimState.status,
        message: 'Grace period end timestamp is missing.',
      };
    }

    const msRemaining = claimState.graceEndsAt.getTime() - Date.now();
    if (msRemaining > 0) {
      const secondsRemaining = Math.ceil(msRemaining / 1000);
      return {
        success: false,
        status: claimState.status,
        graceEndsAt: claimState.graceEndsAt,
        secondsRemaining,
        message: `Grace period has not finished yet. ${secondsRemaining} seconds remaining.`,
      };
    }

    const now = new Date();
    claimState.status = 'EXECUTED';
    claimState.executedAt = now;
    claimState.updatedAt = now;

    globalAuditLogger.logEvent('CLAIM_EXECUTED', {
      correlationId,
      claimId: claimState.claimId,
      actor,
      payload: {
        executedAt: now.toISOString(),
        graceEndedAt: claimState.graceEndsAt.toISOString(),
      },
    });

    return {
      success: true,
      status: claimState.status,
      graceEndsAt: claimState.graceEndsAt,
      secondsRemaining: 0,
      message: 'Grace period complete. Claim executed.',
    };
  }
}

