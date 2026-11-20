import { describe, it, expect } from 'vitest';
import { GracePeriodService } from '../src/gracePeriodService/index.js';
import { ClaimState } from '../src/types/index.js';

function createVerifiedClaim(): ClaimState {
  return {
    claimId: 'claim-test-grace',
    deceasedUserId: 'deceased-user-789',
    status: 'VERIFICATION_IN_PROGRESS',
    quorumConfig: {
      requiredQuorum: 2,
      totalNominees: 3,
      nomineeIds: ['n1', 'n2', 'n3'],
    },
    submittedShares: [
      { nomineeId: 'n1', shareHash: 'hash1', submittedAt: new Date(), maskedIdentifier: 'n***1' },
      { nomineeId: 'n2', shareHash: 'hash2', submittedAt: new Date(), maskedIdentifier: 'n***2' },
    ],
    gracePeriodSeconds: 60, // 60 seconds for testing
    initiatedAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Grace Period & Liveness / Dispute Guard', () => {
  it('should activate grace period and compute countdown', () => {
    const claim = createVerifiedClaim();

    const result = GracePeriodService.activateGracePeriod(claim);
    expect(result.success).toBe(true);
    expect(claim.status).toBe('GRACE_PERIOD_ACTIVE');
    expect(claim.graceEndsAt).toBeDefined();
    expect(result.secondsRemaining).toBe(60);
  });

  it('should immediately halt claim on User Liveness Abort', () => {
    const claim = createVerifiedClaim();
    GracePeriodService.activateGracePeriod(claim);
    expect(claim.status).toBe('GRACE_PERIOD_ACTIVE');

    // Living user triggers abort signal
    const abortResult = GracePeriodService.triggerLivenessAbort(
      claim,
      'I am alive. Unauthorized death claim detected on my account.',
      'user-owner-john@demo.com'
    );

    expect(abortResult.success).toBe(true);
    expect(claim.status).toBe('ABORTED_LIVENESS');
    expect(claim.abortReason).toContain('I am alive');
    expect(claim.graceEndsAt).toBeUndefined(); // timer cleared

    // Cannot restart grace period once aborted
    const restart = GracePeriodService.activateGracePeriod(claim);
    expect(restart.success).toBe(false);
    expect(claim.status).toBe('ABORTED_LIVENESS');
  });

  it('should pause grace period on Legal/Family Dispute', () => {
    const claim = createVerifiedClaim();
    GracePeriodService.activateGracePeriod(claim);

    const disputeResult = GracePeriodService.raiseDispute(
      claim,
      'Succession certificate challenged in High Court',
      'lawyer-jane@legal.com'
    );

    expect(disputeResult.success).toBe(true);
    expect(claim.status).toBe('DISPUTED');
    expect(claim.graceEndsAt).toBeUndefined(); // paused
  });

  it('should put claim on hold for manual review', () => {
    const claim = createVerifiedClaim();
    const hold = GracePeriodService.holdForReview(claim, 'Discrepancy in date of death');

    expect(hold.success).toBe(true);
    expect(claim.status).toBe('HOLD_FOR_REVIEW');
    expect(claim.holdReason).toContain('Discrepancy');
  });
});

