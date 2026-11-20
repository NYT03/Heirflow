import { v4 as uuidv4 } from 'uuid';
import {
  ClaimState,
  DeathCertificateMetadata,
  InitiateClaimSchema,
  NomineeKeyShareSubmission,
  PdfInspectionResult,
} from './types/index.js';
import { parseCertificate, validateGovernmentDomain } from './certificateParser/index.js';
import { MockRegistryVerifier, RegistryVerifier } from './registryVerifier/index.js';
import { QuorumManager } from './quorumManager/index.js';
import { GracePeriodService } from './gracePeriodService/index.js';
import { globalAuditLogger } from './auditLogger/index.js';

export class ClaimVerificationOrchestrator {
  private claims: Map<string, ClaimState> = new Map();
  private registryVerifier: RegistryVerifier;

  constructor(registryVerifier?: RegistryVerifier) {
    this.registryVerifier = registryVerifier || new MockRegistryVerifier();
  }

  public setRegistryVerifier(verifier: RegistryVerifier): void {
    this.registryVerifier = verifier;
  }

  public getRegistryVerifier(): RegistryVerifier {
    return this.registryVerifier;
  }

  /**
   * Initiates a new inheritance claim with certificate details, quorum requirements, and optional first key share.
   */
  public async initiateClaim(
    input: any,
    pdfBuffer?: Buffer,
    correlationId?: string
  ): Promise<{ success: boolean; claimState?: ClaimState; error?: string }> {
    const parsed = InitiateClaimSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors.map((e) => e.message).join('; ') };
    }

    const { deceasedUserId, quorumConfig, certificate, initialShare, gracePeriodSeconds } = parsed.data;
    const claimId = uuidv4();
    const now = new Date();

    // Parse and inspect certificate
    const certMeta = parseCertificate({
      registrationNumber: certificate.registrationNumber,
      deceasedName: certificate.deceasedName,
      dateOfDeath: certificate.dateOfDeath,
      stateOrMunicipality: certificate.stateOrMunicipality,
      qrPayload: certificate.qrPayload,
      pdfBuffer,
    });

    const claimState: ClaimState = {
      claimId,
      deceasedUserId,
      status: 'PENDING_QUORUM',
      quorumConfig,
      submittedShares: [],
      certificateMetadata: certMeta,
      pdfInspection: certMeta.pdfInspection,
      gracePeriodSeconds: gracePeriodSeconds || 604800,
      initiatedAt: now,
      updatedAt: now,
    };

    this.claims.set(claimId, claimState);

    globalAuditLogger.logEvent('CLAIM_INITIATED', {
      correlationId,
      claimId,
      payload: {
        deceasedUserId,
        registrationNumber: certificate.registrationNumber,
        requiredQuorum: quorumConfig.requiredQuorum,
        totalNominees: quorumConfig.totalNominees,
      },
    });

    // Optionally record first nominee share
    if (initialShare) {
      await this.submitKeyShare(claimId, initialShare, correlationId);
    }

    return { success: true, claimState };
  }

  /**
   * Submits a nominee key share and evaluates quorum
   */
  public async submitKeyShare(
    claimId: string,
    submission: NomineeKeyShareSubmission,
    correlationId?: string
  ): Promise<{ success: boolean; claimState?: ClaimState; error?: string }> {
    const claimState = this.claims.get(claimId);
    if (!claimState) {
      return { success: false, error: `Claim '${claimId}' not found.` };
    }

    const result = QuorumManager.submitShare(claimState, submission, correlationId);
    if (!result.success) {
      return { success: false, claimState, error: result.error };
    }

    // If quorum was met, automatically execute verification pipeline
    if (result.quorumReached && claimState.status === 'VERIFICATION_IN_PROGRESS') {
      await this.runVerificationPipeline(claimState, correlationId);
    }

    return { success: true, claimState };
  }

  /**
   * Executes the full Verification Pipeline:
   * 1. PDF Signature & Tamper Inspection
   * 2. QR Code & Government Domain Check
   * 3. Pluggable Civil Registry Cross-Verification
   * 4. State transition to GRACE_PERIOD_ACTIVE (or HOLD_FOR_REVIEW)
   */
  public async runVerificationPipeline(
    claimState: ClaimState,
    correlationId?: string
  ): Promise<ClaimState> {
    const cert = claimState.certificateMetadata;
    if (!cert) {
      GracePeriodService.holdForReview(claimState, 'Missing death certificate metadata', correlationId);
      return claimState;
    }

    // 1. PDF Signature / Tamper Evaluation
    if (claimState.pdfInspection) {
      const { hasEmbeddedSignature, tamperFlags, signatureIntegrity } = claimState.pdfInspection;

      if (!hasEmbeddedSignature || signatureIntegrity === 'MODIFIED_OR_TAMPERED') {
        const reason = `PDF signature integrity failure: ${tamperFlags.join('; ')}`;
        GracePeriodService.holdForReview(claimState, reason, correlationId);
        return claimState;
      }
    }

    // 2. Government Domain Check on QR Payload (if present)
    if (cert.verificationUrl) {
      const domainCheck = validateGovernmentDomain(cert.verificationUrl);
      if (!domainCheck.isValid) {
        const reason = `Security Violation: QR code points to unauthorized domain. ${domainCheck.reason}`;
        GracePeriodService.holdForReview(claimState, reason, correlationId);
        return claimState;
      }
    }

    // 3. Civil Registry Cross-Verification
    const regResult = await this.registryVerifier.verifyRecord({
      registrationNumber: cert.registrationNumber,
      deceasedName: cert.deceasedName,
      dateOfDeath: cert.dateOfDeath,
      stateOrMunicipality: cert.stateOrMunicipality,
    });

    claimState.registryResult = regResult;

    if (regResult.status !== 'VERIFIED') {
      const reason = `Registry verification status '${regResult.status}': ${regResult.mismatches.join('; ')}`;
      GracePeriodService.holdForReview(claimState, reason, correlationId);
      return claimState;
    }

    // 4. All checks passed and Quorum met -> Activate Grace Period!
    if (QuorumManager.isQuorumMet(claimState)) {
      GracePeriodService.activateGracePeriod(claimState, correlationId);
    }

    return claimState;
  }

  public abortLiveness(
    claimId: string,
    reason: string,
    initiator: string,
    correlationId?: string
  ): { success: boolean; claimState?: ClaimState; error?: string } {
    const claimState = this.claims.get(claimId);
    if (!claimState) return { success: false, error: 'Claim not found' };

    GracePeriodService.triggerLivenessAbort(claimState, reason, initiator, correlationId);
    return { success: true, claimState };
  }

  public raiseDispute(
    claimId: string,
    reason: string,
    disputantId: string,
    correlationId?: string
  ): { success: boolean; claimState?: ClaimState; error?: string } {
    const claimState = this.claims.get(claimId);
    if (!claimState) return { success: false, error: 'Claim not found' };

    GracePeriodService.raiseDispute(claimState, reason, disputantId, correlationId);
    return { success: true, claimState };
  }

  public getClaim(claimId: string): ClaimState | undefined {
    return this.claims.get(claimId);
  }

  public clear(): void {
    this.claims.clear();
  }
}
