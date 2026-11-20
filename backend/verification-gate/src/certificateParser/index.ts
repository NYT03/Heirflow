import {
  DeathCertificateMetadata,
  PdfInspectionResult,
} from '../types/index.js';

export interface DomainValidationResult {
  isValid: boolean;
  hostname?: string;
  normalizedUrl?: string;
  reason?: string;
}

/**
 * Strict Government Domain Validator for Indian Official Registries.
 * Enforces that verification URLs must strictly belong to official *.gov.in or *.nic.in domains.
 * Rejects phishing, URL-encoding bypasses, spoofed subdomains, and user-info tricks.
 */
export function validateGovernmentDomain(rawUrl: string): DomainValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, reason: 'Empty or non-string URL provided' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, reason: 'Malformed URL format' };
  }

  // Enforce secure HTTPS protocol for official government registries
  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      hostname: parsed.hostname,
      reason: `Insecure protocol '${parsed.protocol}'. Official government portals require HTTPS.`,
    };
  }

  // Reject credentials in userinfo (e.g., https://crsorgi.gov.in@malicious-site.com)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      hostname: parsed.hostname,
      reason: 'URL contains authentication credentials/userinfo (spoofing indicator).',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Whitelisted official government top-level and second-level domain suffixes
  const isGovIn = hostname === 'gov.in' || hostname.endsWith('.gov.in');
  const isNicIn = hostname === 'nic.in' || hostname.endsWith('.nic.in');

  if (!isGovIn && !isNicIn) {
    return {
      isValid: false,
      hostname,
      reason: `Domain '${hostname}' is not an official government domain (*.gov.in or *.nic.in).`,
    };
  }

  // Guard against attack vectors like "evil-gov.in" or "evil-nic.in"
  if (
    (hostname.endsWith('gov.in') && !hostname.endsWith('.gov.in') && hostname !== 'gov.in') ||
    (hostname.endsWith('nic.in') && !hostname.endsWith('.nic.in') && hostname !== 'nic.in')
  ) {
    return {
      isValid: false,
      hostname,
      reason: `Host '${hostname}' spoofed TLD boundary.`,
    };
  }

  return {
    isValid: true,
    hostname,
    normalizedUrl: parsed.origin + parsed.pathname + parsed.search,
  };
}

/**
 * Extracts verification URL from a raw QR code text or JSON payload
 */
export function extractVerificationUrlFromPayload(payload: string): string | null {
  if (!payload || typeof payload !== 'string') return null;

  const trimmed = payload.trim();

  // Direct URL match
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // JSON payload match (e.g. {"url": "https://..."})
  try {
    const json = JSON.parse(trimmed);
    if (json.url && typeof json.url === 'string') return json.url;
    if (json.verifyUrl && typeof json.verifyUrl === 'string') return json.verifyUrl;
    if (json.verification_url && typeof json.verification_url === 'string') return json.verification_url;
  } catch {
    // Not JSON, continue to regex extract
  }

  // Regex URL extraction
  const urlRegex = /(https?:\/\/[^\s"'<>]+)/i;
  const match = trimmed.match(urlRegex);
  return match ? match[1] : null;
}

/**
 * PDF Signature & Tamper Inspection
 * Scans binary PDF streams for:
 * - Proper PDF header (%PDF-) and EOF markers
 * - Embedded PKCS#7/CAdES digital signature dictionaries (/Type /Sig)
 * - ByteRange array integrity (/ByteRange [ ... ])
 * - Post-signing tampering or modification indicators
 */
export function inspectPdfSignature(buffer: Buffer): PdfInspectionResult {
  if (!buffer || buffer.length < 10) {
    return {
      isPdf: false,
      hasEmbeddedSignature: false,
      signatureIntegrity: 'UNSIGNED',
      tamperFlags: ['File is empty or too small to be a valid document'],
      recommendation: 'FLAG_FOR_MANUAL_REVIEW',
    };
  }

  const header = buffer.subarray(0, 1024).toString('binary');
  const isPdf = header.includes('%PDF-');

  if (!isPdf) {
    return {
      isPdf: false,
      hasEmbeddedSignature: false,
      signatureIntegrity: 'UNSIGNED',
      tamperFlags: ['Missing valid %PDF- magic header'],
      recommendation: 'FLAG_FOR_MANUAL_REVIEW',
    };
  }

  const contentStr = buffer.toString('binary');
  const tamperFlags: string[] = [];

  // Check for digital signature dictionary
  const hasSigType = contentStr.includes('/Type /Sig') || contentStr.includes('/Type/Sig');
  const hasByteRange = contentStr.includes('/ByteRange');
  const hasContents = contentStr.includes('/Contents');

  const hasEmbeddedSignature = hasSigType && hasByteRange && hasContents;

  if (!hasEmbeddedSignature) {
    tamperFlags.push('No embedded digital signature dictionary (/Type /Sig, /ByteRange) detected');
    return {
      isPdf: true,
      hasEmbeddedSignature: false,
      signatureIntegrity: 'UNSIGNED',
      tamperFlags,
      recommendation: 'FLAG_FOR_MANUAL_REVIEW',
    };
  }

  // Parse ByteRange array e.g. /ByteRange [0 1234 5678 9101]
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/;
  const match = contentStr.match(byteRangeRegex);

  let byteRangeCount = 0;
  let byteRangeValid = false;

  if (match) {
    byteRangeCount = 4;
    const offset1 = parseInt(match[1], 10);
    const length1 = parseInt(match[2], 10);
    const offset2 = parseInt(match[3], 10);
    const length2 = parseInt(match[4], 10);

    const totalSignedLength = offset1 + length1 + (offset2 - (offset1 + length1)) + length2;
    const fileLength = buffer.length;

    // Check if substantial data was appended after the signed byte range (tampering indicator)
    const trailingBytes = fileLength - (offset2 + length2);
    if (trailingBytes > 1024) {
      tamperFlags.push(
        `Substantial unverified data (${trailingBytes} bytes) appended after signature byte range (Possible tampering).`
      );
    } else {
      byteRangeValid = true;
    }
  } else {
    tamperFlags.push('Malformed /ByteRange specification in digital signature');
  }

  // Detect SubFilter
  let subFilter = 'Unknown';
  if (contentStr.includes('/adbe.pkcs7.detached')) subFilter = 'adbe.pkcs7.detached';
  else if (contentStr.includes('/ETSI.CAdES.detached')) subFilter = 'ETSI.CAdES.detached';
  else if (contentStr.includes('/adbe.pkcs7.sha1')) subFilter = 'adbe.pkcs7.sha1';
  else if (contentStr.includes('/adbe.x509.rsa_sha1')) subFilter = 'adbe.x509.rsa_sha1';

  // Extract /Name /Signer
  let signer: string | undefined;
  const nameMatch = contentStr.match(/\/Name\s*\(([^)]+)\)/);
  if (nameMatch) {
    signer = nameMatch[1];
  }

  // Extract /M (Signing Time)
  let signingTime: string | undefined;
  const dateMatch = contentStr.match(/\/M\s*\(D:([^)]+)\)/);
  if (dateMatch) {
    signingTime = dateMatch[1];
  }

  // Multiple xref / incremental modification checks
  const eofCount = (contentStr.match(/%%EOF/g) || []).length;
  if (eofCount > 2) {
    tamperFlags.push(`Multiple revision updates (${eofCount} %%EOF markers) detected post-creation`);
  }

  const isTampered = tamperFlags.length > 0;

  return {
    isPdf: true,
    hasEmbeddedSignature: true,
    signatureIntegrity: isTampered ? 'MODIFIED_OR_TAMPERED' : 'VALID',
    signatureDetails: {
      signer,
      signingTime,
      subFilter,
      byteRangeCount,
    },
    tamperFlags,
    recommendation: isTampered ? 'FLAG_FOR_MANUAL_REVIEW' : 'AUTO_APPROVE',
  };
}

/**
 * Ingest and validate certificate metadata & optional QR code / PDF
 */
export function parseCertificate(params: {
  registrationNumber: string;
  deceasedName: string;
  dateOfDeath: string;
  stateOrMunicipality: string;
  qrPayload?: string;
  pdfBuffer?: Buffer;
}): DeathCertificateMetadata & { pdfInspection?: PdfInspectionResult } {
  let verificationUrl: string | undefined;
  let isGovDomainValid: boolean | undefined;

  if (params.qrPayload) {
    const extractedUrl = extractVerificationUrlFromPayload(params.qrPayload);
    if (extractedUrl) {
      verificationUrl = extractedUrl;
      const domainCheck = validateGovernmentDomain(extractedUrl);
      isGovDomainValid = domainCheck.isValid;
    } else {
      isGovDomainValid = false;
    }
  }

  let pdfInspection: PdfInspectionResult | undefined;
  if (params.pdfBuffer) {
    pdfInspection = inspectPdfSignature(params.pdfBuffer);
  }

  return {
    registrationNumber: params.registrationNumber.trim().toUpperCase(),
    deceasedName: params.deceasedName.trim(),
    dateOfDeath: params.dateOfDeath.trim(),
    stateOrMunicipality: params.stateOrMunicipality.trim(),
    verificationUrl,
    isGovDomainValid,
    hasDigitalSignature: pdfInspection?.hasEmbeddedSignature,
    signatureIntegrity: pdfInspection?.signatureIntegrity,
    rawQrPayload: params.qrPayload,
    pdfInspection,
  };
}

