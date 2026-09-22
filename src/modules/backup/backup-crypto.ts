import crypto from 'crypto';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export interface EncryptionResult {
  algorithm: string;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export class BackupCryptoService {
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly KEY_LENGTH = 32;
  private static readonly SALT_LENGTH = 16;
  private static readonly IV_LENGTH = 12; // 96-bit IV recommended for GCM

  /**
   * Sắp xếp các khóa của object theo thứ tự bảng chữ cái để tạo chuỗi JSON chuẩn hóa (Canonical JSON)
   */
  static canonicalJsonStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalJsonStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + this.canonicalJsonStringify(obj[k]))
        .join(',') +
      '}'
    );
  }

  /**
   * Tính mã băm SHA-256 cho chuỗi dữ liệu (hex)
   */
  static computeSha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Xác thực mã băm SHA-256
   */
  static verifySha256(content: string, expectedChecksum: string): boolean {
    const actualChecksum = this.computeSha256(content);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  /**
   * Mã hóa chuỗi plaintext bằng mật khẩu sử dụng PBKDF2 + AES-256-GCM
   */
  static encryptWithPassword(plaintext: string, password: string): EncryptionResult {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const key = crypto.pbkdf2Sync(
      password,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      'sha256',
    );

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      algorithm: 'aes-256-gcm',
      kdf: 'pbkdf2',
      iterations: this.PBKDF2_ITERATIONS,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
  }

  /**
   * Giải mã ciphertext bằng mật khẩu
   */
  static decryptWithPassword(
    ciphertextHex: string,
    password: string,
    params: {
      salt: string;
      iv: string;
      tag: string;
      iterations?: number;
    },
  ): string {
    try {
      const salt = Buffer.from(params.salt, 'hex');
      const iv = Buffer.from(params.iv, 'hex');
      const tag = Buffer.from(params.tag, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');
      const iterations = params.iterations || this.PBKDF2_ITERATIONS;

      const key = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        this.KEY_LENGTH,
        'sha256',
      );

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new AppError(
        'Mật khẩu giải mã không chính xác hoặc tệp tin bị hỏng',
        400,
        ERROR_CODE.BACKUP_PASSWORD_INVALID,
      );
    }
  }
}
