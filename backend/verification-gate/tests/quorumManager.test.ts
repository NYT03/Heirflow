import { describe, it, expect } from 'vitest';
import { QuorumManager } from '../src/quorumManager/index.js';
import { ClaimState } from '../src/types/index.js';

function createMockClaim(requiredQuorum = 2, totalNominees = 3): ClaimState {
  return {
    claimId: 'test-claim-123',
    deceasedUserId: 'deceased-user-456',
    status: 'PENDING_QUORUM',
    quorumConfig: {
      requiredQuorum,
      totalNominees,
      nomineeIds: ['nominee-alice', 'nominee-bob', 'nominee-charlie'],
    },
    submittedShares: [],
    gracePeriodSeconds: 604800,
    initiatedAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('N-of-M Nominee Key Share & Quorum Validation', () => {
  it('should accept valid key share and stay in PENDING_QUORUM when incomplete', () => {
    const claim = createMockClaim(2, 3);

    const result = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: 'HEIRFLOW-SHARE-alice-key-segment-abcdef123456',
    });

    expect(result.success).toBe(true);
    expect(result.quorumReached).toBe(false);
    expect(result.sharesCollected).toBe(1);
    expect(claim.status).toBe('PENDING_QUORUM');
    // Ensure raw secret is NOT stored in state
    expect((claim.submittedShares[0] as any).rawShare).toBeUndefined();
    expect(claim.submittedShares[0].shareHash).toBeDefined();
  });

  it('should transition to VERIFICATION_IN_PROGRESS when quorum N is reached', () => {
    const claim = createMockClaim(2, 3);

    // Share 1
    QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: 'HEIRFLOW-SHARE-alice-key-segment-abcdef123456',
    });

    // Share 2 (triggers quorum)
    const result2 = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-bob',
      rawShare: 'HEIRFLOW-SHARE-bob-key-segment-789012345678',
    });

    expect(result2.success).toBe(true);
    expect(result2.quorumReached).toBe(true);
    expect(result2.sharesCollected).toBe(2);
    expect(claim.status).toBe('VERIFICATION_IN_PROGRESS');
  });

  it('should reject unauthorized nominee not in configured roster', () => {
    const claim = createMockClaim(2, 3);

    const result = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-eve-unauthorized',
      rawShare: 'HEIRFLOW-SHARE-eve-attempt-1234567890',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not authorized');
    expect(claim.submittedShares.length).toBe(0);
  });

  it('should reject duplicate submission by the same nominee', () => {
    const claim = createMockClaim(2, 3);

    QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: 'HEIRFLOW-SHARE-alice-key-segment-abcdef123456',
    });

    const dupResult = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: 'HEIRFLOW-SHARE-alice-key-segment-different',
    });

    expect(dupResult.success).toBe(false);
    expect(dupResult.error).toContain('already submitted');
    expect(claim.submittedShares.length).toBe(1);
  });

  it('should reject duplicate cryptographic share value', () => {
    const claim = createMockClaim(2, 3);
    const sharedKey = 'HEIRFLOW-SHARE-identical-key-value-123456';

    QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: sharedKey,
    });

    const collisionResult = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-bob',
      rawShare: sharedKey,
    });

    expect(collisionResult.success).toBe(false);
    expect(collisionResult.error).toContain('already been recorded');
  });

  it('should reject malformed or invalid character key shares', () => {
    const claim = createMockClaim(2, 3);

    const result = QuorumManager.submitShare(claim, {
      nomineeId: 'nominee-alice',
      rawShare: 'too-short',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 10 characters');
  });
});

