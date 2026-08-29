import crypto from 'crypto';
import { envConfig } from '../../config/env.config';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Lấy encryption key 32-byte từ APP_SECRET hoặc JWT accessSecret.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.APP_SECRET || envConfig.jwt.accessSecret;
  if (!secret) {
    throw new Error('Encryption secret is not configured. Set APP_SECRET or JWT_ACCESS_SECRET environment variable.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Mã hóa dữ liệu nhạy cảm (như webhook secret) bằng AES-256-GCM.
 * Chuỗi trả về định dạng: `iv:authTag:encryptedData` (hex).
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Giải mã dữ liệu đã được mã hóa bằng AES-256-GCM.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted ciphertext format (expected iv:authTag:data)');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Tạo chữ ký HMAC-SHA256 cho webhook payload kèm timestamp để chống Replay Attack.
 * Signature format: `t=1756000000,v1=abcdef...`
 */
export function signWebhookPayload(payload: string, secret: string, timestamp: number = Math.floor(Date.now() / 1000)): { signature: string; timestamp: number } {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return {
    signature: `t=${timestamp},v1=${hmac}`,
    timestamp,
  };
}

/**
 * Xác minh chữ ký HMAC-SHA256 của Webhook.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300, // 5 minutes tolerance
): boolean {
  if (!signatureHeader || !secret) return false;

  const elements = signatureHeader.split(',');
  let timestampStr: string | undefined;
  let signatureV1: string | undefined;

  for (const element of elements) {
    const [key, value] = element.trim().split('=');
    if (key === 't') timestampStr = value;
    if (key === 'v1') signatureV1 = value;
  }

  if (!timestampStr || !signatureV1) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Check timestamp drift (replay attack prevention)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
    return false;
  }

  const expectedSignedPayload = `${timestamp}.${payload}`;
  const expectedHmac = crypto.createHmac('sha256', secret).update(expectedSignedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureV1, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Băm API Key bằng SHA-256 để lưu trữ an toàn trong DB.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Sinh cặp API Key mới:
 * - rawKey: `fw_live_<32 bytes hex>` (chỉ trả về cho người dùng 1 lần duy nhất)
 * - keyPrefix: `fw_live_` + 8 ký tự đầu (để hiển thị nhận diện)
 * - keyHash: SHA-256 hash lưu vào DB
 */
export function generateApiKey(prefix = 'fw_live_'): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `${prefix}${randomBytes}`;
  const keyPrefix = rawKey.substring(0, prefix.length + 8);
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Sinh Webhook Secret ngẫu nhiên (dạng `whsec_<random>`).
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}
