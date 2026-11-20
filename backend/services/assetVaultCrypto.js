const crypto = require('crypto');

const MASTER_VAULT_SECRET = process.env.JWT_SECRET || 'heirflow_secret_key_2024';

/**
 * Derives a deterministic 256-bit AES key bound to the specific Claim + Smart Contract
 */
function deriveContractKey(claimId, contractAddress, deceasedUserId) {
  return crypto
    .createHmac('sha256', MASTER_VAULT_SECRET)
    .update(`CONTRACT-KEY:${claimId}:${contractAddress}:${deceasedUserId}`)
    .digest(); // 32 bytes for AES-256
}

/**
 * Encrypts an asset's sensitive payload (details + instructions) using AES-256-GCM
 */
function encryptAssetPayload(asset, keyBuffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  const plaintext = JSON.stringify({
    details: typeof asset.details === 'string' ? safeParse(asset.details) : asset.details,
    instructions: asset.instructions || 'Transfer to authorized nominee.',
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

/**
 * Decrypts an encrypted asset package back to plaintext details & instructions
 */
function decryptAssetPayload(encryptedPkg, keyBuffer) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBuffer,
    Buffer.from(encryptedPkg.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedPkg.authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPkg.ciphertext, 'hex')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = {
  deriveContractKey,
  encryptAssetPayload,
  decryptAssetPayload,
};
