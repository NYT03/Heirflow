const { v4: uuidv4 } = require('uuid');

/**
 * RBI Account Aggregator (ReBIT AA) Service
 * Supports:
 *  1. Live Setu / ReBIT AA Sandbox API (when AA_CLIENT_ID, AA_CLIENT_SECRET, AA_PRODUCT_INSTANCE_ID are set)
 *  2. Built-in ReBIT AA Consent & FIP Simulator for zero-config local/hackathon testing
 */
class RbiAccountAggregatorService {
  constructor() {
    this.baseUrl = process.env.AA_BASE_URL || 'https://fiu-sandbox.setu.co/v2';
    this.clientId = process.env.AA_CLIENT_ID;
    this.clientSecret = process.env.AA_CLIENT_SECRET;
    this.productInstanceId = process.env.AA_PRODUCT_INSTANCE_ID;
    this.localConsents = new Map();
  }

  isLiveSandboxConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.productInstanceId);
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-client-id': this.clientId,
      'x-client-secret': this.clientSecret,
      'x-product-instance-id': this.productInstanceId,
    };
  }

  /**
   * Step 1: Create an RBI AA Consent Request for DEPOSIT (Bank Account) discovery
   */
  async createConsent({ mobileNumber, aaHandle, userId }) {
    const vua = aaHandle && aaHandle.includes('@') ? aaHandle.trim() : `${mobileNumber}@onemoney`;

    if (this.isLiveSandboxConfigured()) {
      try {
        const now = new Date();
        const dataStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const payload = {
          consentDuration: { unit: 'MONTH', value: '1' },
          vua,
          dataRange: { from: dataStart.toISOString(), to: now.toISOString() },
          context: [{ key: 'accounttype', value: 'SAVINGS' }],
          redirectUrl: process.env.AA_REDIRECT_URL || 'http://localhost:3001/assets',
          consentTypes: ['PROFILE', 'SUMMARY'],
          fiTypes: ['DEPOSIT'],
          fetchType: 'ONETIME',
          purpose: {
            code: '101',
            refUri: 'https://api.rebit.org.in/aa/purpose/101.xml',
            text: 'Estate bank account discovery and nominee transfer mapping',
            category: { type: 'Personal Finance' },
          },
          consentMode: 'VIEW',
        };

        const res = await fetch(`${this.baseUrl}/consents`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          return {
            mode: 'setu_aa_sandbox',
            consentId: data.id,
            status: data.status || 'PENDING',
            vua,
            redirectUrl: data.url,
          };
        }

        const errText = await res.text();
        if (res.status >= 500) {
          console.warn(`⚠️ Setu AA Sandbox returned ${res.status}, falling back to local ReBIT AA Simulator: ${errText}`);
        } else {
          throw new Error(`Setu AA Sandbox error (${res.status}): ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        if (!String(err.message).startsWith('Setu AA Sandbox error (4')) {
          console.warn(`⚠️ Setu AA Sandbox unavailable (${err.message}), using local ReBIT AA Simulator.`);
        } else {
          throw err;
        }
      }
    }

    // Local ReBIT AA Simulator
    const consentId = `aa-consent-${uuidv4().slice(0, 12)}`;
    const consent = {
      consentId,
      userId,
      mobileNumber: mobileNumber || '9876543210',
      vua,
      fiTypes: ['DEPOSIT'],
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.localConsents.set(consentId, consent);

    return {
      mode: 'rbi_aa_local_simulator',
      consentId,
      status: 'PENDING',
      vua,
    };
  }

  /**
   * Step 2 (Local Simulator): User approves AA Consent via OTP
   */
  approveLocalConsent(consentId, otp = '123456') {
    const consent = this.localConsents.get(consentId);
    if (!consent) {
      throw new Error('AA Consent request not found');
    }
    if (!otp || String(otp).length < 4) {
      throw new Error('Valid OTP is required to approve AA consent');
    }
    consent.status = 'ACTIVE';
    consent.approvedAt = new Date().toISOString();
    return consent;
  }

  /**
   * Step 3: Fetch Bank Accounts (DEPOSIT FIPs) once consent is ACTIVE
   */
  async fetchBankAccounts(consentId) {
    if (this.isLiveSandboxConfigured() && !this.localConsents.has(consentId)) {
      const consentRes = await fetch(`${this.baseUrl}/consents/${consentId}`, {
        headers: this.getHeaders(),
      });
      if (!consentRes.ok) {
        throw new Error(`Failed to check AA consent status (${consentRes.status})`);
      }
      const consentData = await consentRes.json();
      if (consentData.status !== 'ACTIVE') {
        throw new Error(`AA Consent is '${consentData.status}'. User must approve consent before fetching bank accounts.`);
      }

      // Create FI Data Session on Setu AA Sandbox
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sessionRes = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          consentId,
          dataRange: { from: from.toISOString(), to: now.toISOString() },
          format: 'json',
        }),
      });
      if (!sessionRes.ok) {
        throw new Error(`Failed to create AA data session (${sessionRes.status})`);
      }
      const sessionData = await sessionRes.json();
      const fetchRes = await fetch(`${this.baseUrl}/sessions/${sessionData.id}`, {
        headers: this.getHeaders(),
      });
      const fiData = await fetchRes.json();
      const accounts = this.parseRebitDepositPayload(fiData);

      return {
        mode: 'setu_aa_sandbox',
        consentId,
        accounts,
      };
    }

    // Local ReBIT AA Simulator
    const consent = this.localConsents.get(consentId);
    if (!consent) {
      throw new Error('AA Consent not found');
    }
    if (consent.status !== 'ACTIVE') {
      throw new Error(`AA Consent status is '${consent.status}'. Approve consent first.`);
    }

    const accounts = [
      {
        type: 'bank',
        name: 'HDFC Bank Ltd — Savings (XXXX4821)',
        details: {
          fipId: 'HDFC-FIP',
          bankName: 'HDFC Bank Ltd',
          maskedAccNumber: 'XXXX-XXXX-4821',
          ifsc: 'HDFC0001245',
          accountType: 'SAVINGS',
          branch: 'Navrangpura, Ahmedabad',
          currentBalanceINR: 485200,
          aaHandle: consent.vua,
          consentId,
          source: 'RBI Account Aggregator (DEPOSIT FIP)',
        },
        instructions:
          'Transfer bank account balance to designated nominee upon verified claim. Present death certificate and AA reference to HDFC Bank estate nodal officer.',
      },
      {
        type: 'bank',
        name: 'State Bank of India — Savings (XXXX9014)',
        details: {
          fipId: 'SBI-FIP',
          bankName: 'State Bank of India',
          maskedAccNumber: 'XXXX-XXXX-9014',
          ifsc: 'SBIN0000432',
          accountType: 'SAVINGS',
          branch: 'CG Road, Ahmedabad',
          currentBalanceINR: 215800,
          aaHandle: consent.vua,
          consentId,
          source: 'RBI Account Aggregator (DEPOSIT FIP)',
        },
        instructions:
          'Transfer bank account balance to designated nominee upon verified claim via SBI home branch deceased-claim desk.',
      },
      {
        type: 'bank',
        name: 'ICICI Bank Ltd — Salary / Checking (XXXX7339)',
        details: {
          fipId: 'ICICI-FIP',
          bankName: 'ICICI Bank Ltd',
          maskedAccNumber: 'XXXX-XXXX-7339',
          ifsc: 'ICIC0000024',
          accountType: 'CURRENT / SALARY',
          branch: 'SG Highway, Ahmedabad',
          currentBalanceINR: 132500,
          aaHandle: consent.vua,
          consentId,
          source: 'RBI Account Aggregator (DEPOSIT FIP)',
        },
        instructions:
          'Transfer bank account balance to designated nominee upon verified claim via ICICI Bank estate settlement desk.',
      },
    ];

    return {
      mode: 'rbi_aa_local_simulator',
      consentId,
      vua: consent.vua,
      accounts,
    };
  }

  parseRebitDepositPayload(fiData) {
    const results = [];
    const fipList = fiData?.Payload || fiData?.fi || [];
    for (const fip of fipList) {
      const fipId = fip.fipID || fip.fipId || 'BANK-FIP';
      const dataItems = fip.data || [];
      for (const acc of dataItems) {
        const summary = acc.Summary || acc.Account?.Summary || {};
        const masked = acc.maskedAccNumber || 'XXXX';
        results.push({
          type: 'bank',
          name: `${fipId} — ${summary.type || 'SAVINGS'} (${masked})`,
          details: {
            fipId,
            maskedAccNumber: masked,
            ifsc: summary.ifscCode || 'N/A',
            accountType: summary.type || 'SAVINGS',
            branch: summary.branch || 'N/A',
            currentBalanceINR: Number(summary.currentBalance || 0),
            source: 'Setu RBI AA Sandbox',
          },
          instructions: `Transfer bank account balance (${masked}) to designated nominee upon verified claim.`,
        });
      }
    }
    return results;
  }
}

module.exports = new RbiAccountAggregatorService();
