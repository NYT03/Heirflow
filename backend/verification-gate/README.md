# 🛡️ HeirFlow — Nominee Death Verification & Quorum Gate

> **Production-grade TypeScript module** responsible for sovereign death certificate verification, tamper detection, $N$-of-$M$ cryptographic nominee key share collection, and a living user dispute/liveness abort barrier before estate execution.

---

## 🏛️ System Architecture & State Machine

```
                              [ Nominee Submits Claim ]
                         (Death Certificate + Key Share #1)
                                      │
                                      ▼
                             [ PENDING_QUORUM ]
                       Waiting for N-of-M Nominee Shares
                                      │
                      (Nominee #2..N submit key shares)
                                      │
                                      ▼
                       [ VERIFICATION_IN_PROGRESS ]
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
[ 1. PDF Signature & Tamper ]                           [ 2. QR Domain Whitelist ]
 - Embedded /Type /Sig ?                                 - Strict *.gov.in / *.nic.in ?
 - /ByteRange integrity ?                                - HTTPS protocol enforced ?
 - Post-signing modifications ?                          - Phishing/spoofing check ?
          │                                                       │
          └───────────────────────────┬───────────────────────────┘
                                      ▼
                        [ 3. Civil Registry Cross-Check ]
                         - Registration Number match ?
                         - Normalized Deceased Name match ?
                         - Date of Death match ?
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │ Fails Any Security Check                          │ Passes All Checks
            ▼                                                   ▼
   [ HOLD_FOR_REVIEW ]                                [ GRACE_PERIOD_ACTIVE ]
  Flagged for manual review                           Configurable timer (e.g. 7 days)
                                                                │
                            ┌───────────────────────────────────┼───────────────────────────────────┐
                            ▼                                   ▼                                   ▼
                 [ Liveness Abort Signal ]             [ Dispute Raised ]                    [ Timer Elapses ]
               (Living owner halts claim)            (Family/court challenge)                (Handover Unlocked)
                            │                                   │                                   │
                            ▼                                   ▼                                   ▼
                   [ ABORTED_LIVENESS ]                    [ DISPUTED ]                        [ EXECUTED ]
                  Execution permanently                  Execution paused                 Assets transferred &
                        revoked                          pending review                  subscriptions cancelled
```

---

## 🔍 Core Verification Capabilities

### 1. Certificate Ingestion & Identifier Extraction
- **File / Manual Intake**: Accepts uploaded PDF certificates, registration numbers, date of death, and municipal authorities (e.g., Central Civil Registration System - ORGI, Gujarat e-Olakh, Delhi e-District).
- **Anti-Phishing QR Validator (`validateGovernmentDomain`)**:
  - Enforces that any embedded verification link points **strictly** to official government domains (`*.gov.in` or `*.nic.in`).
  - Actively rejects subdomain spoofing (e.g., `https://gov.in.attacker.org`), lookalike domains (`https://fake-gov.in.com`), non-HTTPS protocols (`http://`), and URL credential userinfo injection (`https://crsorgi.gov.in@malicious.com`).

### 2. PDF Digital Signature & Tamper Check (`inspectPdfSignature`)
- Inspects binary PDF streams for embedded PKCS#7 / CAdES signature dictionaries (`/Type /Sig`, `/ByteRange`, `/Contents`).
- Verifies `/ByteRange` integrity to detect trailing unauthenticated data appended after signing.
- Checks revision updates (`%%EOF` marker counts) to catch post-signing alterations.
- Unsigned, altered, or tampered PDFs are automatically routed to `HOLD_FOR_REVIEW` rather than auto-approved.

### 3. Pluggable Civil Registry Cross-Verification (`RegistryVerifier`)
- **`MockRegistryVerifier`**: Local & Buildathon testing adapter with pre-seeded municipal records and configurable simulation states (`VERIFIED`, `NOT_FOUND`, `MISMATCH`, `PORTAL_UNAVAILABLE`).
- **`OfficialPortalVerifier`**: Production-ready connector stub for official government API gateways (CRS / DigiLocker National Gateway) utilizing mutual TLS (mTLS) without brittle scraping or captcha bypasses.
- **Fuzzy Name Normalization (`crossVerifyFields`)**: Strips honorifics (`Late`, `Shri`, `Smt`, `Mr`, `Dr`), collapses whitespace, and provides field-by-field discrepancy explanations.

### 4. $N$-of-$M$ Nominee Key Share & Quorum Gate (`QuorumManager`)
- Enforces multi-party authorization: requires $N$ out of $M$ authorized nominees to contribute their secret shares.
- **Zero-Plaintext Logging Rule**: Incoming raw shares are immediately converted to SHA-256 hashes (`shareHash`). Raw key material is **never logged**, masked in audit logs as `[MASKED_SHARE:****xxxx]`.
- Enforces nominee authorization against registered estate rosters and prevents replay or duplicate share submissions.

### 5. Grace Period & Living User Abort Guard (`GracePeriodService`)
- Once quorum and registry checks pass, triggers a configurable grace period (default 7 days; configurable in seconds for testing).
- **Liveness Abort Signal (`livenessAbort`)**: If a false or malicious death claim is submitted, the living owner can trigger an abort signal. This immediately transitions the estate to `ABORTED_LIVENESS`, halts all asset handovers, and logs an immutable security event.
- **Dispute Hook (`raiseDispute`)**: Pauses execution countdown if contested by family members or legal counsel.

---

## 📁 Module Directory Structure

```
backend/verification-gate/
├── src/
│   ├── types/                  # Zod schemas & TypeScript interfaces
│   ├── auditLogger/            # Append-only structured event logger with PII masking
│   ├── certificateParser/      # QR URL extraction, .gov.in whitelist & PDF tamper check
│   ├── registryVerifier/       # Pluggable registry verifier interface & adapters
│   ├── quorumManager/          # N-of-M share tracking & state machine
│   ├── gracePeriodService/     # Grace period timers, dispute hooks & liveness abort
│   ├── orchestrator.ts         # Central pipeline coordinator
│   ├── api/routes.ts           # Express router endpoints
│   └── index.ts                # Public module exports
├── tests/
│   ├── certificateParser.test.ts  # Domain validation & PDF inspection tests
│   ├── registryVerifier.test.ts   # Name normalization & registry adapter tests
│   ├── quorumManager.test.ts      # Quorum thresholds, duplicate prevention tests
│   ├── gracePeriodService.test.ts # Grace period countdown & abort guard tests
│   └── integration.test.ts        # End-to-end multi-nominee scenario tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 🧪 Running the Test Suite

Run all 32 unit and integration tests:

```bash
cd backend/verification-gate
npm test
```

### Test Coverage Highlights
- ✅ **Valid QR / `.gov.in` Domain + Registry Match + 2-of-3 Quorum** $\rightarrow$ Reaches `GRACE_PERIOD_ACTIVE`.
- ✅ **Spoofed non-`.gov.in` Domain** $\rightarrow$ Rejection and transition to `HOLD_FOR_REVIEW`.
- ✅ **Mismatched Certificate Fields (Date of death / Name)** $\rightarrow$ Transition to `HOLD_FOR_REVIEW` with exact mismatch reasons.
- ✅ **Incomplete Quorum ($k < N$)** $\rightarrow$ Safely remains in `PENDING_QUORUM`.
- ✅ **Living User Abort** $\rightarrow$ Immediate termination to `ABORTED_LIVENESS` with zero execution leakage.
- ✅ **Unsigned / Tampered PDF Inspection** $\rightarrow$ Flagged for manual review.

---

## 📡 REST API Reference

Mounted in the main HeirFlow API under `/api/verification`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/verification/claims/initiate` | Ingest death certificate, set $N$-of-$M$ quorum rules, and submit initial share. |
| `POST` | `/api/verification/claims/:claimId/share` | Submit an additional nominee key share towards quorum. |
| `GET` | `/api/verification/claims/:claimId/status` | Get claim state, collected shares, and countdown seconds remaining. |
| `POST` | `/api/verification/claims/:claimId/abort` | **Living User Liveness Abort** — immediately halts claim. |
| `POST` | `/api/verification/claims/:claimId/dispute` | Raise legal/family dispute — freezes timer. |
| `POST` | `/api/verification/certificate/inspect` | Standalone inspection of PDF signatures or QR payload URLs. |
| `GET` | `/api/verification/claims/:claimId/audit-logs` | Retrieve append-only structured audit logs for a claim. |

---

## 🔌 Wiring Up Production Registry APIs

To switch from `MockRegistryVerifier` to production governmental registries:

1. Obtain authorized API credentials from **Digital India / DigiLocker National Gateway** or state registries (e.g., Gujarat e-Olakh / Delhi e-District).
2. Set the environment variables in `backend/.env`:
   ```env
   CRS_API_KEY=your_authorized_portal_api_key
   CRS_API_ENDPOINT=https://api.digitallocker.gov.in/v1/crs/death/verify
   ```
3. `server.js` automatically instantiates `OfficialPortalVerifier` when `CRS_API_KEY` is present.

