import { describe, it, expect, beforeEach } from 'vitest';
import { ClaimVerificationOrchestrator } from '../src/orchestrator.js';
import { MockRegistryVerifier } from '../src/registryVerifier/index.js';

describe('Integration: Nominee Death Verification & Quorum Gate End-to-End', () => {
  let orchestrator: ClaimVerificationOrchestrator;
  let mockVerifier: MockRegistryVerifier;

  beforeEach(() => {
    mockVerifier = new MockRegistryVerifier();
    orchestrator = new ClaimVerificationOrchestrator(mockVerifier);
  });

  it('Full Success Flow: Valid QR .gov.in + Registry Match + 2-of-3 Quorum -> GRACE_PERIOD_ACTIVE', async () => {
    // 1. Initiate claim with valid CRS death certificate and 2-of-3 quorum requirement
    const initRes = await orchestrator.initiateClaim({
      deceasedUserId: 'deceased-john-123',
      quorumConfig: {
        requiredQuorum: 2,
        totalNominees: 3,
        nomineeIds: ['nominee-alice', 'nominee-bob', 'nominee-charlie'],
      },
      certificate: {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
        stateOrMunicipality: 'Gujarat e-Olakh',
        qrPayload: 'https://eolakh.gujarat.gov.in/verify/GJ-AHM-2024-D-098234',
      },
      initialShare: {
        nomineeId: 'nominee-alice',
        rawShare: 'HEIRFLOW-SHARE-alice-share-key-11223344',
      },
      gracePeriodSeconds: 300,
    });

    expect(initRes.success).toBe(true);
    const claimId = initRes.claimState!.claimId;

    // 2. Status should be PENDING_QUORUM (1 of 2 shares collected)
    expect(initRes.claimState!.status).toBe('PENDING_QUORUM');
    expect(initRes.claimState!.submittedShares.length).toBe(1);

    // 3. Second nominee submits share -> Quorum is reached (2 of 3)
    const shareRes2 = await orchestrator.submitKeyShare(claimId, {
      nomineeId: 'nominee-bob',
      rawShare: 'HEIRFLOW-SHARE-bob-share-key-55667788',
    });

    expect(shareRes2.success).toBe(true);

    // 4. Verification pipeline ran automatically -> status transitions to GRACE_PERIOD_ACTIVE!
    const finalClaim = orchestrator.getClaim(claimId)!;
    expect(finalClaim.status).toBe('GRACE_PERIOD_ACTIVE');
    expect(finalClaim.registryResult?.status).toBe('VERIFIED');
    expect(finalClaim.graceEndsAt).toBeDefined();
    expect(finalClaim.submittedShares.length).toBe(2);
  });

  it('Security Guard Flow: Spoofed non-gov.in QR URL -> HOLD_FOR_REVIEW', async () => {
    // Ingest certificate pointing to a phishing / spoofed domain
    const initRes = await orchestrator.initiateClaim({
      deceasedUserId: 'user-victim',
      quorumConfig: {
        requiredQuorum: 1,
        totalNominees: 2,
        nomineeIds: ['nominee-alice', 'nominee-bob'],
      },
      certificate: {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
        stateOrMunicipality: 'Gujarat e-Olakh',
        qrPayload: 'https://fake-crsorgi-spoof.com/verify?reg=098234', // Spoofed!
      },
      initialShare: {
        nomineeId: 'nominee-alice',
        rawShare: 'HEIRFLOW-SHARE-alice-key-1234567890',
      },
    });

    expect(initRes.success).toBe(true);
    const claim = orchestrator.getClaim(initRes.claimState!.claimId)!;

    // Even though quorum (1 of 1) was met, QR domain check failed -> Flagged for Review!
    expect(claim.status).toBe('HOLD_FOR_REVIEW');
    expect(claim.holdReason).toContain('unauthorized domain');
  });

  it('Registry Discrepancy Flow: Mismatched Date of Death -> HOLD_FOR_REVIEW', async () => {
    const initRes = await orchestrator.initiateClaim({
      deceasedUserId: 'deceased-john-123',
      quorumConfig: {
        requiredQuorum: 1,
        totalNominees: 2,
        nomineeIds: ['nominee-alice', 'nominee-bob'],
      },
      certificate: {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-15', // MISMATCH: Registry has 2024-11-01
        stateOrMunicipality: 'Gujarat e-Olakh',
      },
      initialShare: {
        nomineeId: 'nominee-alice',
        rawShare: 'HEIRFLOW-SHARE-alice-key-1234567890',
      },
    });

    const claim = orchestrator.getClaim(initRes.claimState!.claimId)!;
    expect(claim.status).toBe('HOLD_FOR_REVIEW');
    expect(claim.registryResult?.status).toBe('MISMATCH');
    expect(claim.holdReason).toContain('Date of death mismatch');
  });

  it('Living User Abort Flow: User halts false claim during Grace Period', async () => {
    // 1. Claim reaches Grace Period
    const initRes = await orchestrator.initiateClaim({
      deceasedUserId: 'deceased-john-123',
      quorumConfig: {
        requiredQuorum: 1,
        totalNominees: 1,
        nomineeIds: ['nominee-alice'],
      },
      certificate: {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
        stateOrMunicipality: 'Gujarat e-Olakh',
      },
      initialShare: {
        nomineeId: 'nominee-alice',
        rawShare: 'HEIRFLOW-SHARE-alice-key-1234567890',
      },
    });

    const claimId = initRes.claimState!.claimId;
    expect(orchestrator.getClaim(claimId)!.status).toBe('GRACE_PERIOD_ACTIVE');

    // 2. Living owner notices notification and triggers Liveness Abort
    const abortRes = orchestrator.abortLiveness(
      claimId,
      'I am alive! My phone was stolen and this claim is fraudulent.',
      'john-owner-id'
    );

    expect(abortRes.success).toBe(true);
    const abortedClaim = orchestrator.getClaim(claimId)!;
    expect(abortedClaim.status).toBe('ABORTED_LIVENESS');
    expect(abortedClaim.graceEndsAt).toBeUndefined();

    // 3. Further share submissions are rejected
    const attempt = await orchestrator.submitKeyShare(claimId, {
      nomineeId: 'nominee-alice',
      rawShare: 'HEIRFLOW-SHARE-some-other-key-12345678',
    });
    expect(attempt.success).toBe(false);
    expect(attempt.error).toContain('terminal state');
  });
});
