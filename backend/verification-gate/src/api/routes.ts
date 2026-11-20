import { Router, Request, Response } from 'express';
import { ClaimVerificationOrchestrator } from '../orchestrator.js';
import {
  AbortClaimSchema,
  DisputeClaimSchema,
  InitiateClaimSchema,
  NomineeShareSubmissionSchema,
} from '../types/index.js';
import { inspectPdfSignature, validateGovernmentDomain } from '../certificateParser/index.js';
import { globalAuditLogger } from '../auditLogger/index.js';

export function createVerificationRouter(orchestrator: ClaimVerificationOrchestrator): Router {
  const router = Router();

  // POST /api/verification/claims/initiate
  router.post('/claims/initiate', async (req: Request, res: Response) => {
    try {
      const correlationId = (req.headers['x-correlation-id'] as string) || undefined;
      const pdfBuffer = req.body?.rawPdfBase64
        ? Buffer.from(req.body.rawPdfBase64, 'base64')
        : undefined;
      const result = await orchestrator.initiateClaim(req.body, pdfBuffer, correlationId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(201).json({ success: true, data: result.claimState });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/verification/claims/:claimId/share
  router.post('/claims/:claimId/share', async (req: Request, res: Response) => {
    try {
      const claimId = String(req.params.claimId);
      const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

      const parsed = NomineeShareSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors.map((e) => e.message).join('; '),
        });
      }

      const result = await orchestrator.submitKeyShare(claimId, parsed.data, correlationId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error, data: result.claimState });
      }

      return res.json({ success: true, data: result.claimState });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/verification/claims/:claimId/status
  router.get('/claims/:claimId/status', (req: Request, res: Response) => {
    try {
      const claimId = String(req.params.claimId);
      const claim = orchestrator.getClaim(claimId);

      if (!claim) {
        return res.status(404).json({ success: false, error: `Claim '${claimId}' not found.` });
      }

      const now = Date.now();
      const secondsRemaining = claim.graceEndsAt
        ? Math.max(0, Math.floor((claim.graceEndsAt.getTime() - now) / 1000))
        : undefined;

      return res.json({
        success: true,
        data: {
          ...claim,
          quorumMet: claim.submittedShares.length >= claim.quorumConfig.requiredQuorum,
          secondsRemaining,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/verification/claims/:claimId/abort (User Liveness Abort)
  router.post('/claims/:claimId/abort', (req: Request, res: Response) => {
    try {
      const claimId = String(req.params.claimId);
      const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

      const parsed = AbortClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors.map((e) => e.message).join('; '),
        });
      }

      const result = orchestrator.abortLiveness(
        claimId,
        parsed.data.reason,
        parsed.data.initiator,
        correlationId
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        data: result.claimState,
        message: 'Liveness abort successfully processed. Handover halted.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/verification/claims/:claimId/dispute
  router.post('/claims/:claimId/dispute', (req: Request, res: Response) => {
    try {
      const claimId = String(req.params.claimId);
      const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

      const parsed = DisputeClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors.map((e) => e.message).join('; '),
        });
      }

      const result = orchestrator.raiseDispute(
        claimId,
        parsed.data.reason,
        parsed.data.disputantId,
        correlationId
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        data: result.claimState,
        message: 'Claim paused under dispute.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/verification/certificate/inspect
  router.post('/certificate/inspect', (req: Request, res: Response) => {
    try {
      const { qrUrl, rawPdfBase64 } = req.body;

      const inspection: any = {};

      if (qrUrl) {
        inspection.domainValidation = validateGovernmentDomain(qrUrl);
      }

      if (rawPdfBase64) {
        const buffer = Buffer.from(rawPdfBase64, 'base64');
        inspection.pdfInspection = inspectPdfSignature(buffer);
      }

      return res.json({ success: true, data: inspection });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/verification/claims/:claimId/execute
  router.post('/claims/:claimId/execute', async (req: Request, res: Response) => {
    try {
      const claimId = String(req.params.claimId);
      const correlationId = (req.headers['x-correlation-id'] as string) || undefined;
      const actor = String(req.body?.actor || 'SYSTEM');

      const result = await orchestrator.executeClaim(claimId, actor, correlationId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error, data: result.claimState });
      }

      return res.json({
        success: true,
        data: result.claimState,
        executionResult: result.executionResult,
        message: 'Grace period complete. Asset handover executed.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/verification/claims/:claimId/audit-logs
  router.get('/claims/:claimId/audit-logs', (req: Request, res: Response) => {
    const claimId = String(req.params.claimId);
    const logs = globalAuditLogger.getEventsForClaim(claimId);
    return res.json({ success: true, data: logs });
  });

  return router;
}
