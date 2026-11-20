export type HeirflowAssetType = 'bank' | 'crypto' | 'subscription' | 'file' | 'property' | 'social';

export interface ParsedChromeEntry {
  id: string;
  name: string;
  url: string;
  domain: string;
  username: string;
  password: string;
  note: string;
  type: HeirflowAssetType;
}

export interface EncryptedCredentialPayload {
  alg: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export const SAMPLE_CHROME_CSV = `name,url,username,password,note
HDFC NetBanking,https://netbanking.hdfcbank.com,rahul.sharma@gmail.com,HdfcDemo#2026,Primary salary & savings account
Zerodha Kite,https://kite.zerodha.com,RS4821,ZrdhDemo@99,Demat & mutual fund portfolio
CoinDCX,https://coindcx.com,rahul.sharma@gmail.com,CryptoDemo!88,BTC & ETH holdings
Google Drive,https://drive.google.com,rahul.sharma@gmail.com,GDriveDemo$12,Property & tax documents
Netflix India,https://www.netflix.com,rahul.sharma@gmail.com,NflxDemo*44,Family monthly plan
GitHub,https://github.com,rahulsharma-dev,GhDemo^77,Code repositories & domains`;

/**
 * RFC-4180 compliant CSV parser for Chrome / Edge / Brave password exports.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  const text = csvText.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\r' && next === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else if (char === '\n' || char === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function extractDomain(rawUrl: string): string {
  try {
    const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.trim();
  }
}

export function categorizeAccount(name: string, domain: string): HeirflowAssetType {
  const haystack = `${name} ${domain}`.toLowerCase();

  if (/(bank|hdfc|icici|sbi|axis|kotak|chase|wellsfargo|citi|zerodha|groww|upstox|kite|paytm|phonepe|razorpay|stripe)/.test(haystack)) {
    return 'bank';
  }
  if (/(crypto|binance|coinbase|coindcx|wazirx|metamask|phantom|ledger|kraken|wallet|bitcoin|ethereum)/.test(haystack)) {
    return 'crypto';
  }
  if (/(drive\.google|dropbox|onedrive|icloud|box\.com|mega\.nz|notion)/.test(haystack)) {
    return 'file';
  }
  if (/(facebook|instagram|twitter|x\.com|linkedin|discord|reddit|youtube|snapchat|threads)/.test(haystack)) {
    return 'social';
  }
  if (/(airbnb|zillow|nobroker|magicbricks|99acres|property)/.test(haystack)) {
    return 'property';
  }
  return 'subscription';
}

export function parseChromePasswordCsv(csvText: string): ParsedChromeEntry[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV file must include a header row and at least one saved account.');
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const urlIdx = headers.indexOf('url');
  const userIdx = headers.indexOf('username');
  const passIdx = headers.indexOf('password');
  const noteIdx = headers.indexOf('note');

  if (urlIdx === -1 || userIdx === -1 || passIdx === -1) {
    throw new Error('Invalid Chrome CSV format. Expected columns: name, url, username, password.');
  }

  const entries: ParsedChromeEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const url = (row[urlIdx] || '').trim();
    const username = (row[userIdx] || '').trim();
    const password = row[passIdx] || '';
    const domain = extractDomain(url);
    const name = ((nameIdx !== -1 ? row[nameIdx] : '') || domain || `Account ${i}`).trim();
    const note = noteIdx !== -1 ? (row[noteIdx] || '').trim() : '';

    if (!name && !url && !username) continue;

    entries.push({
      id: `${i}-${domain}-${username}`,
      name,
      url,
      domain,
      username,
      password,
      note,
      type: categorizeAccount(name, domain),
    });
  }

  return entries;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const KDF_ITERATIONS = 100_000;

async function deriveAesKey(passphrase: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/**
 * Encrypts sensitive credential JSON in the browser using AES-GCM-256 before upload.
 */
export async function encryptCredentialPayload(
  payload: { url: string; username: string; password: string; note?: string },
  passphrase: string
): Promise<EncryptedCredentialPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, ['encrypt']);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoded);

  return {
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts a stored AES-GCM-256 credential payload using the user's or nominee's Vault Passphrase.
 */
export async function decryptCredentialPayload(
  encrypted: EncryptedCredentialPayload,
  passphrase: string
): Promise<{ url: string; username: string; password: string; note?: string }> {
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const key = await deriveAesKey(passphrase, salt, ['decrypt']);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
