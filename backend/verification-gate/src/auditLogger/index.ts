import { v4 as uuidv4 } from 'uuid';
import { AuditLogEvent } from '../types/index.js';

/**
 * Masks sensitive raw key shares (keeps last 4 characters only)
 * Never prints raw cryptographic material to logs or telemetry.
 */
export function maskKeyShare(share: string): string {
  if (!share || share.length <= 4) return '[MASKED_KEY_SHARE]';
  return `[MASKED_SHARE:****${share.slice(-4)}]`;
}

/**
 * Masks identifiers (e.g. email addresses or IDs) for PII compliance
 */
export function maskIdentifier(identifier: string): string {
  if (!identifier) return '***';
  if (identifier.includes('@')) {
    const [name, domain] = identifier.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  if (identifier.length <= 4) return '****';
  return `${identifier.slice(0, 2)}***${identifier.slice(-2)}`;
}

/**
 * Structured, append-only in-memory and console audit logger
 */
export class AuditLogger {
  private events: AuditLogEvent[] = [];

  public logEvent(
    eventType: string,
    params: {
      correlationId?: string;
      claimId?: string;
      actor?: string;
      payload?: Record<string, unknown>;
    }
  ): AuditLogEvent {
    const event: AuditLogEvent = {
      id: uuidv4(),
      correlationId: params.correlationId || uuidv4(),
      claimId: params.claimId,
      eventType,
      timestamp: new Date().toISOString(),
      actor: params.actor ? maskIdentifier(params.actor) : 'SYSTEM',
      payload: this.sanitizePayload(params.payload || {}),
    };

    this.events.push(event);

    // Formatted structured output
    console.log(
      `[AUDIT] [${event.timestamp}] [${event.eventType}] [claim:${event.claimId || 'N/A'}] [actor:${event.actor}]`,
      JSON.stringify(event.payload)
    );

    return event;
  }

  public getEventsForClaim(claimId: string): AuditLogEvent[] {
    return this.events.filter((e) => e.claimId === claimId);
  }

  public getAllEvents(): AuditLogEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }

  private sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('share') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('password')
      ) {
        sanitized[key] = typeof value === 'string' ? maskKeyShare(value) : '[MASKED_SECRET]';
      } else if (lowerKey.includes('email') || lowerKey.includes('phone')) {
        sanitized[key] = typeof value === 'string' ? maskIdentifier(value) : '***';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const globalAuditLogger = new AuditLogger();

