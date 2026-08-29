import {
  encryptSecret,
  decryptSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  generateApiKey,
  hashApiKey,
  generateWebhookSecret,
} from './crypto.helper';

describe('crypto.helper', () => {
  describe('AES-256-GCM Secret Encryption / Decryption', () => {
    it('should encrypt and decrypt secret correctly', () => {
      const original = 'whsec_9876543210abcdef1234567890';
      const encrypted = encryptSecret(original);

      expect(encrypted).not.toEqual(original);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:cipher

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('should return empty string when encrypting or decrypting empty string', () => {
      expect(encryptSecret('')).toBe('');
      expect(decryptSecret('')).toBe('');
    });

    it('should throw error on invalid ciphertext format', () => {
      expect(() => decryptSecret('invalid_format')).toThrow(
        'Invalid encrypted ciphertext format',
      );
    });

    it('should produce different ciphertext for each encryption of the same plaintext (random IV)', () => {
      const text = 'my_secret_key';
      const enc1 = encryptSecret(text);
      const enc2 = encryptSecret(text);
      expect(enc1).not.toEqual(enc2);
      expect(decryptSecret(enc1)).toEqual(text);
      expect(decryptSecret(enc2)).toEqual(text);
    });
  });

  describe('Webhook HMAC-SHA256 Signing & Verification', () => {
    const secret = 'whsec_test_secret_key_123456';
    const payload = JSON.stringify({ event: 'job.completed', jobId: '123' });

    it('should sign and verify valid webhook payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const { signature } = signWebhookPayload(payload, secret, now);

      expect(signature).toContain(`t=${now},v1=`);

      const isValid = verifyWebhookSignature(payload, signature, secret, 300);
      expect(isValid).toBe(true);
    });

    it('should reject when payload is tampered', () => {
      const now = Math.floor(Date.now() / 1000);
      const { signature } = signWebhookPayload(payload, secret, now);

      const tamperedPayload = JSON.stringify({ event: 'job.completed', jobId: '999' });
      const isValid = verifyWebhookSignature(tamperedPayload, signature, secret, 300);
      expect(isValid).toBe(false);
    });

    it('should reject when signature is tampered', () => {
      const now = Math.floor(Date.now() / 1000);
      const fakeSignature = `t=${now},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`;
      const isValid = verifyWebhookSignature(payload, fakeSignature, secret, 300);
      expect(isValid).toBe(false);
    });

    it('should reject when timestamp exceeds tolerance (Replay Attack)', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const { signature } = signWebhookPayload(payload, secret, oldTimestamp);

      // Tolerance is 300 seconds (5 minutes)
      const isValid = verifyWebhookSignature(payload, signature, secret, 300);
      expect(isValid).toBe(false);
    });

    it('should return false for missing or malformed signature header', () => {
      expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
      expect(verifyWebhookSignature(payload, 'invalid-header', secret)).toBe(false);
      expect(verifyWebhookSignature(payload, 't=123', secret)).toBe(false);
    });
  });

  describe('API Key Generation & Hashing', () => {
    it('should generate valid API key structure', () => {
      const { rawKey, keyPrefix, keyHash } = generateApiKey();

      expect(rawKey.startsWith('fw_live_')).toBe(true);
      expect(keyPrefix.startsWith('fw_live_')).toBe(true);
      expect(keyPrefix.length).toBe(16); // 'fw_live_' (8) + 8 chars = 16
      expect(keyHash).toEqual(hashApiKey(rawKey));
      expect(keyHash.length).toBe(64); // SHA-256 hex is 64 characters
    });

    it('should generate unique keys each time', () => {
      const k1 = generateApiKey();
      const k2 = generateApiKey();
      expect(k1.rawKey).not.toEqual(k2.rawKey);
      expect(k1.keyHash).not.toEqual(k2.keyHash);
    });

    it('should generate random webhook secrets', () => {
      const s1 = generateWebhookSecret();
      const s2 = generateWebhookSecret();
      expect(s1.startsWith('whsec_')).toBe(true);
      expect(s1).not.toEqual(s2);
    });
  });
});
