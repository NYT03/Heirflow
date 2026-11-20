import { v4 as uuidv4 } from 'uuid';
import {
  ClaimState,
  InitiateClaimSchema,
  NomineeKeyShareSubmission,
} from './types/index.js';
import { parseCertificate, validateGovernmentDomain } from './certificateParser/index.js';
import { MockRegistryVerifier, RegistryVerifier } from './registryVerifier/index.js';
import { QuorumManager } from './quorumManager/index.js';
import { GracePeriodService } from './gracePeriodService/index.js';
import { globalAuditLogger } from './auditLogger/index.js';
import { ClaimStore, InMemoryClaimStore } from './store/index.js';

export type ExecutionCallback = (claimState: ClaimState, actor: string) => Promise<unknown> | unknown;

export interface OrchestratorOptions {
  registryVerifier?: RegistryVerifier;
  store?: ClaimStore;
  onExecuteClaim?: ExecutionCallback;
}

export class ClaimVerificationOrchestrator {
  private store: ClaimStore;
  private registryVerifier: RegistryVerifier;
  private onExecuteClaim?: ExecutionCallback;

  constructor(verifierOrOptions?: RegistryVerifier | OrchestratorOptions) {
    if (verifierOrOptions && 'verifyRecord' in verifierOrOptions) {
      this.registryVerifier = verifierOrOptions;
      this.store = new InMemoryClaimStore();
    } else {
      const opts = verifierOrOptions || {};
      this.registryVerifier = opts.registryVerifier || new MockRegistryVerifier();
      this.store = opts.store || new InMemoryClaimStore();
      this.onExecuteClaim = opts.onExecuteClaim;
    }
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
      claimantId: typeof input?.claimantId === 'string' ? input.claimantId : undefined,
      evidencePath: typeof input?.evidencePath === 'string' ? input.evidencePath : undefined,
      status: 'PENDING_QUORUM',
      quorumConfig,
      submittedShares: [],
      certificateMetadata: certMeta,
      pdfInspection: certMeta.pdfInspection,
      gracePeriodSeconds: gracePeriodSeconds || 604800,
      initiatedAt: now,
      updatedAt: now,
    };

    this.store.save(claimState);

    globalAuditLogger.logEvent('CLAIM_INITIATED', {
      correlationId,
      claimId,
      actor: claimState.claimantId,
      payload: {
        deceasedUserId,
        registrationNumber: certificate.registrationNumber,
        requiredQuorum: quorumConfig.requiredQuorum,
        totalNominees: quorumConfig.totalNominees,
      },
    });

    if (initialShare) {
      await this.submitKeyShare(claimId, initialShare, correlationId);
    }

    return { success: true, claimState: this.store.get(claimId) || claimState };
  }

  /**
   * Submits a nominee key share and evaluates quorum
   */
  public async submitKeyShare(
    claimId: string,
    submission: NomineeKeyShareSubmission,
    correlationId?: string
  ): Promise<{ success: boolean; claimState?: ClaimState; error?: string }> {
    const claimState = this.store.get(claimId);
    if (!claimState) {
      return { success: false, error: `Claim '${claimId}' not found.` };
    }

    const result = QuorumManager.submitShare(claimState, submission, correlationId);
    if (!result.success) {
      return { success: false, claimState, error: result.error };
    }

    this.store.save(claimState);

    if (result.quorumReached && claimState.status === 'VERIFICATION_IN_PROGRESS') {
      await this.runVerificationPipeline(claimState, correlationId);
    }

    return { success: true, claimState: this.store.get(claimId) || claimState };
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
      this.store.save(claimState);
      return claimState;
    }

    if (claimState.pdfInspection) {
      const { hasEmbeddedSignature, tamperFlags, signatureIntegrity } = claimState.pdfInspection;
      if (!hasEmbeddedSignature || signatureIntegrity === 'MODIFIED_OR_TAMPERED') {
        const reason = `PDF signature integrity failure: ${tamperFlags.join('; ')}`;
        GracePeriodService.holdForReview(claimState, reason, correlationId);
        this.store.save(claimState);
        return claimState;
      }
    }

    if (cert.verificationUrl) {
      const domainCheck = validateGovernmentDomain(cert.verificationUrl);
      if (!domainCheck.isValid) {
        const reason = `Security Violation: QR code points to unauthorized domain. ${domainCheck.reason}`;
        GracePeriodService.holdForReview(claimState, reason, correlationId);
        this.store.save(claimState);
        return claimState;
      }
    }

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
      this.store.save(claimState);
      return claimState;
    }

    if (QuorumManager.isQuorumMet(claimState)) {
      GracePeriodService.activateGracePeriod(claimState, correlationId);
    }

    this.store.save(claimState);
    return claimState;
  }

  public abortLiveness(
    claimId: string,
    reason: string,
    initiator: string,
    correlationId?: string
  ): { success: boolean; claimState?: ClaimState; error?: string } {
    const claimState = this.store.get(claimId);
    if (!claimState) return { success: false, error: 'Claim not found' };

    GracePeriodService.triggerLivenessAbort(claimState, reason, initiator, correlationId);
    this.store.save(claimState);
    return { success: true, claimState };
  }

  public raiseDispute(
    claimId: string,
    reason: string,
    disputantId: string,
    correlationId?: string
  ): { success: boolean; claimState?: ClaimState; error?: string } {
    const claimState = this.store.get(claimId);
    if (!claimState) return { success: false, error: 'Claim not found' };

    GracePeriodService.raiseDispute(claimState, reason, disputantId, correlationId);
    this.store.save(claimState);
    return { success: true, claimState };
  }

  /**
   * Executes post-mortem asset handover ONLY after the grace period has completed.
   */
  public async executeClaim(
    claimId: string,
    actor: string,
    correlationId?: string
  ): Promise<{ success: boolean; claimState?: ClaimState; executionResult?: unknown; error?: string }> {
    const claimState = this.store.get(claimId);
    if (!claimState) return { success: false, error: 'Claim not found' };

    const result = GracePeriodService.executeAfterGracePeriod(claimState, actor, correlationId);
    if (!result.success) {
      return { success: false, claimState, error: result.message };
    }

    let executionResult: unknown;
    if (this.onExecuteClaim) {
      executionResult = await this.onExecuteClaim(claimState, actor);
    }

    this.store.save(claimState);
    return { success: true, claimState, executionResult };
  }

  public getClaim(claimId: string): ClaimState | undefined {
    return this.store.get(claimId);
  }

  public listClaimsForUser(userId: string): ClaimState[] {
    return this.store.listForUser(userId);
  }

  public clear(): void {
    this.store.clear();
  }
}
