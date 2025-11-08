import crypto from 'crypto';

const KEY_HEX = process.env.ENCRYPTION_KEY || '0000000000000000000000000000000000000000000000000000000000000000';
const KEY = Buffer.from(KEY_HEX, 'hex'); // 32 bytes for AES-256

export function encryptText(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12); // GCM standard
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ct: enc.toString('base64'),
    tag: tag.toString('base64')
  };
}

export function decryptText(payload) {
  if (!payload) return '';
  const iv = Buffer.from(payload.iv, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString('utf8');
}
