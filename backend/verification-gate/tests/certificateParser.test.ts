import { describe, it, expect } from 'vitest';
import {
  extractVerificationUrlFromPayload,
  inspectPdfSignature,
  validateGovernmentDomain,
} from '../src/certificateParser/index.js';

describe('Certificate Parser & Security Verification', () => {
  describe('Government Domain Whitelist & Spoofing Guard', () => {
    it('should validate official .gov.in and .nic.in domains over HTTPS', () => {
      const validUrls = [
        'https://crsorgi.gov.in/web/index.php/auth/certVerify/098234',
        'https://eolakh.gujarat.gov.in/cert/verify?reg=GJ2024982',
        'https://edistrict.delhigovt.nic.in/death/verify/441209',
        'https://services.india.gov.in/service/detail/death-certificate',
      ];

      for (const url of validUrls) {
        const result = validateGovernmentDomain(url);
        expect(result.isValid).toBe(true);
        expect(result.reason).toBeUndefined();
      }
    });

    it('should reject spoofed non-government domains that mimic gov.in', () => {
      const spoofedUrls = [
        'https://fake-crsorgi.com/verify?domain=gov.in',
        'https://gov.in.attacker.org/verify/1234',
        'https://attacker-gov.in/verify',
        'https://crsorgi.gov.in.scam-registry.net/verify',
        'https://crsorgi.gov.in@malicious-site.com/verify', // userinfo spoof
        'https://nic.in.phishing.io/cert',
      ];

      for (const url of spoofedUrls) {
        const result = validateGovernmentDomain(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBeDefined();
      }
    });

    it('should reject non-HTTPS URLs even if domain is official', () => {
      const insecureUrl = 'http://crsorgi.gov.in/cert/verify/123';
      const result = validateGovernmentDomain(insecureUrl);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('HTTPS');
    });

    it('should reject malformed or non-URL inputs', () => {
      expect(validateGovernmentDomain('not-a-url').isValid).toBe(false);
      expect(validateGovernmentDomain('').isValid).toBe(false);
    });
  });

  describe('QR Code Payload Extraction', () => {
    it('should extract direct URL from QR payload', () => {
      const payload = 'https://crsorgi.gov.in/verify/CERT-998811';
      expect(extractVerificationUrlFromPayload(payload)).toBe(payload);
    });

    it('should extract URL from JSON payload', () => {
      const jsonPayload = JSON.stringify({
        regNo: 'GJ-AHM-2024-D-098234',
        url: 'https://eolakh.gujarat.gov.in/verify/98234',
      });
      expect(extractVerificationUrlFromPayload(jsonPayload)).toBe(
        'https://eolakh.gujarat.gov.in/verify/98234'
      );
    });

    it('should extract URL embedded in plain text block', () => {
      const text = 'Official Govt Certificate verify at https://crsorgi.gov.in/v/12345 Validated';
      expect(extractVerificationUrlFromPayload(text)).toBe('https://crsorgi.gov.in/v/12345');
    });
  });

  describe('PDF Digital Signature & Tamper Inspection', () => {
    it('should flag unsigned PDF documents for manual review', () => {
      const plainPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Title (Death Certificate) >>\nendobj\nxref\n0 2\n0000000000 65535 f \ntrailer\n<< /Size 2 >>\nstartxref\n60\n%%EOF'
      );

      const inspection = inspectPdfSignature(plainPdf);
      expect(inspection.isPdf).toBe(true);
      expect(inspection.hasEmbeddedSignature).toBe(false);
      expect(inspection.signatureIntegrity).toBe('UNSIGNED');
      expect(inspection.recommendation).toBe('FLAG_FOR_MANUAL_REVIEW');
      expect(inspection.tamperFlags.length).toBeGreaterThan(0);
    });

    it('should identify valid embedded PKCS#7/CAdES digital signature', () => {
      const signedPdfContent =
        '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '3 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ' +
        '/ByteRange [0 200 400 200] /Contents <308201> /Name (Registrar General of India) /M (D:20241104103000Z) >>\nendobj\n' +
        'xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 >>\nstartxref\n500\n%%EOF\n';

      const signedPdf = Buffer.from(signedPdfContent);
      const inspection = inspectPdfSignature(signedPdf);

      expect(inspection.isPdf).toBe(true);
      expect(inspection.hasEmbeddedSignature).toBe(true);
      expect(inspection.signatureDetails?.signer).toBe('Registrar General of India');
      expect(inspection.signatureDetails?.subFilter).toBe('adbe.pkcs7.detached');
    });

    it('should flag documents with excessive incremental modifications or appended data', () => {
      // PDF with multiple %%EOF markers indicating post-signing alterations
      const tamperedContent =
        '%PDF-1.7\n' +
        '/Type /Sig /ByteRange [0 100 200 100] /Contents <3082> \n%%EOF\n' +
        '%%EOF\n' +
        '%%EOF\n';

      const tamperedPdf = Buffer.from(tamperedContent);
      const inspection = inspectPdfSignature(tamperedPdf);

      expect(inspection.hasEmbeddedSignature).toBe(true);
      expect(inspection.signatureIntegrity).toBe('MODIFIED_OR_TAMPERED');
      expect(inspection.recommendation).toBe('FLAG_FOR_MANUAL_REVIEW');
      expect(inspection.tamperFlags.some((f) => f.includes('Multiple revision updates'))).toBe(true);
    });
  });
});

