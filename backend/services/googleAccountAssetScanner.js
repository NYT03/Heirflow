/**
 * Google Account Bank Discovery Scanner
 * Discovers bank accounts linked to the user's Gmail (via live Gmail API or demo mode)
 * and prepares them for transfer to the designated nominee upon verified claim.
 */
class GoogleAccountAssetScanner {
  constructor({ accessToken, email, mockMode = true } = {}) {
    this.accessToken = accessToken || null;
    this.email = email || 'user@gmail.com';
    this.mockMode = mockMode || !this.accessToken;
  }

  async scanAll() {
    if (!this.mockMode && this.accessToken) {
      return await this.scanLiveGmail();
    }
    return this.runSimulatedDiscovery();
  }

  /**
   * Live Gmail API scan: searches exclusively for bank statements, bank alerts,
   * and UPI-linked bank accounts associated with this Gmail.
   */
  async scanLiveGmail() {
    const query =
      '(subject:(statement OR "account summary" OR "bank account" OR "netbanking" OR "IFSC" OR UPI OR GPay OR HDFC OR ICICI OR SBI OR Axis OR Kotak OR Chase))';

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      throw new Error(`Gmail API error (${listRes.status}): ${errText.slice(0, 200)}`);
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    const metadataList = await Promise.all(
      messages.slice(0, 40).map(async (m) => {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
        const r = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
        if (!r.ok) return null;
        return r.json();
      })
    );

    const banksByDomain = new Map();

    for (const msg of metadataList) {
      if (!msg || !msg.payload || !Array.isArray(msg.payload.headers)) continue;
      const headers = msg.payload.headers;
      const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
      const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
      const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';

      const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s<>]+@[^\s<>]+)/);
      const senderEmail = emailMatch ? emailMatch[1].toLowerCase() : '';
      const domain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';
      if (!domain || domain === 'gmail.com') continue;

      const parts = domain.split('.');
      const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : domain;
      const rawDisplay = from.replace(/<[^>]+>/g, '').replace(/["']/g, '').trim();
      const bankName = rawDisplay && !rawDisplay.includes('@') ? rawDisplay : rootDomain;

      if (!banksByDomain.has(rootDomain)) {
        banksByDomain.set(rootDomain, {
          type: 'bank',
          name: `${bankName} (${rootDomain})`,
          details: {
            bankDomain: rootDomain,
            senderEmail,
            registeredEmail: this.email,
            sampleSubject: subject,
            detectedDate: date,
            source: 'Live Gmail API',
          },
          instructions: `Transfer bank account balance to designated nominee upon verified claim. Contact ${bankName} estate/nodal officer with death certificate.`,
          confidence: 0.95,
        });
      }
    }

    const discoveredAssets = Array.from(banksByDomain.values());

    return {
      source: 'gmail_live_api',
      email: this.email,
      summary: {
        totalAssets: discoveredAssets.length,
        scannedMessages: messages.length,
      },
      discoveredAssets,
    };
  }

  runSimulatedDiscovery() {
    const email = this.email;
    const handle = email.split('@')[0];

    const discoveredAssets = [
      {
        type: 'bank',
        name: 'HDFC Bank Savings Account & GPay UPI (Demo)',
        details: {
          bank: 'HDFC Bank Ltd',
          accountType: 'Savings Account',
          upiId: `${handle}@okhdfcbank`,
          registeredEmail: email,
        },
        instructions: 'Transfer bank account balance to designated nominee upon verified claim. Contact HDFC Bank estate nodal officer with death certificate.',
        confidence: 0.98,
      },
      {
        type: 'bank',
        name: 'State Bank of India (SBI) Savings Account (Demo)',
        details: {
          bank: 'State Bank of India',
          accountType: 'Savings Account',
          upiId: `${handle}@ybl`,
          registeredEmail: email,
        },
        instructions: 'Transfer bank account balance to designated nominee upon verified claim. Submit death certificate and succession proof to SBI home branch.',
        confidence: 0.94,
      },
      {
        type: 'bank',
        name: 'ICICI Bank Salary / Checking Account (Demo)',
        details: {
          bank: 'ICICI Bank Ltd',
          accountType: 'Checking / Salary Account',
          registeredEmail: email,
        },
        instructions: 'Transfer bank account balance to designated nominee upon verified claim via ICICI Bank estate settlement desk.',
        confidence: 0.91,
      },
    ];

    return {
      source: 'gmail_demo_mode',
      email,
      summary: { totalAssets: discoveredAssets.length },
      discoveredAssets,
    };
  }
}

module.exports = GoogleAccountAssetScanner;
