import { describe, it, expect } from 'vitest';
import {
  crossVerifyFields,
  MockRegistryVerifier,
  normalizeName,
  OfficialPortalVerifier,
} from '../src/registryVerifier/index.js';
import { DeathCertificateMetadata, RegistryRecord } from '../src/types/index.js';

describe('Civil Registry Verification & Cross-Matching', () => {
  describe('Name Normalization', () => {
    it('should strip common honorifics and extraneous whitespace', () => {
      expect(normalizeName('Late Shri Ramesh Patel')).toBe('ramesh patel');
      expect(normalizeName('Smt. Sunita Sharma')).toBe('sunita sharma');
      expect(normalizeName('Dr. Amit   Kumar Verma')).toBe('amit verma');
    });
  });

  describe('Field Cross-Verification Logic', () => {
    const cert: DeathCertificateMetadata = {
      registrationNumber: 'GJ-AHM-2024-D-098234',
      deceasedName: 'Late John Doe',
      dateOfDeath: '2024-11-01',
      stateOrMunicipality: 'Gujarat e-Olakh',
    };

    it('should succeed when all extracted fields match registry record', () => {
      const record: RegistryRecord = {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
        status: 'REGISTERED',
        issuingAuthority: 'Ahmedabad Municipal Corporation',
      };

      const result = crossVerifyFields(cert, record);
      expect(result.isMatch).toBe(true);
      expect(result.mismatches.length).toBe(0);
    });

    it('should report explicit mismatches when fields do not align', () => {
      const mismatchedRecord: RegistryRecord = {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'Different Name',
        dateOfDeath: '2024-10-25', // wrong date
        status: 'REGISTERED',
        issuingAuthority: 'Ahmedabad Municipal Corporation',
      };

      const result = crossVerifyFields(cert, mismatchedRecord);
      expect(result.isMatch).toBe(false);
      expect(result.mismatches.length).toBe(2);
      expect(result.mismatches.some((m) => m.includes('Date of death mismatch'))).toBe(true);
      expect(result.mismatches.some((m) => m.includes('Deceased name mismatch'))).toBe(true);
    });

    it('should reject record if status is CANCELLED or UNDER_INQUIRY', () => {
      const cancelledRecord: RegistryRecord = {
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
        status: 'CANCELLED',
        issuingAuthority: 'Ahmedabad Municipal Corporation',
      };

      const result = crossVerifyFields(cert, cancelledRecord);
      expect(result.isMatch).toBe(false);
      expect(result.mismatches.some((m) => m.includes('CANCELLED'))).toBe(true);
    });
  });

  describe('MockRegistryVerifier Adapter', () => {
    it('should return VERIFIED for registered records', async () => {
      const verifier = new MockRegistryVerifier();
      const res = await verifier.verifyRecord({
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.matchedRecord).toBeDefined();
      expect(res.mismatches.length).toBe(0);
    });

    it('should return NOT_FOUND for unknown registration numbers', async () => {
      const verifier = new MockRegistryVerifier();
      const res = await verifier.verifyRecord({
        registrationNumber: 'UNKNOWN-REG-0000',
        deceasedName: 'Someone',
        dateOfDeath: '2024-01-01',
      });

      expect(res.status).toBe('NOT_FOUND');
    });

    it('should support configurable PORTAL_UNAVAILABLE state', async () => {
      const verifier = new MockRegistryVerifier();
      verifier.setForcedStatus('PORTAL_UNAVAILABLE');

      const res = await verifier.verifyRecord({
        registrationNumber: 'GJ-AHM-2024-D-098234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-11-01',
      });

      expect(res.status).toBe('PORTAL_UNAVAILABLE');
    });
  });

  describe('OfficialPortalVerifier Adapter Stub', () => {
    it('should return PORTAL_UNAVAILABLE with clear guidance when unconfigured', async () => {
      const verifier = new OfficialPortalVerifier();
      const res = await verifier.verifyRecord({
        registrationNumber: 'CRS-1234',
        deceasedName: 'John Doe',
        dateOfDeath: '2024-01-01',
      });

      expect(res.status).toBe('PORTAL_UNAVAILABLE');
      expect(res.mismatches[0]).toContain('API credentials');
    });
  });
});

