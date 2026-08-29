import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { access, unlink } from 'fs/promises';
import path from 'path';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const mimeTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export interface StoredReceipt {
  key: string;
  buffer?: Buffer;
  absolutePath?: string;
  mimeType: string;
  extension: string;
}

export class ReceiptFileService {
  private readonly rootDir = path.resolve(envConfig.receipts.uploadDir);

  async save(userId: string, file: Express.Multer.File): Promise<string> {
    const extension = extensionByMimeType[file.mimetype];
    if (!extension || !this.hasValidSignature(file.mimetype, file.buffer)) {
      throw new AppError(
        'Receipt content does not match a supported file type',
        422,
        ERROR_CODE.FILE_TYPE_UNSUPPORTED,
      );
    }

    const key = `receipts/${userId}/${randomUUID()}${extension}`;
    const client = this.createR2Client();
    await client.send(new PutObjectCommand({
      Bucket: envConfig.r2.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
    }));

    return key;
  }

  async resolve(key: string): Promise<StoredReceipt> {
    if (this.isR2ReceiptKey(key)) {
      const client = this.createR2Client();
      try {
        const object = await client.send(new GetObjectCommand({
          Bucket: envConfig.r2.bucketName,
          Key: key,
        }));
        if (!object.Body) {
          throw new Error('R2 object body is empty');
        }

        const extension = path.extname(key).toLowerCase();
        const mimeType = object.ContentType || mimeTypeByExtension[extension];
        if (!mimeType || !mimeTypeByExtension[extension]) {
          throw new Error('R2 object has an unsupported content type');
        }

        return {
          key,
          buffer: Buffer.from(await object.Body.transformToByteArray()),
          mimeType,
          extension,
        };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError('Receipt file not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
      }
    }

    // Compatibility path for receipts created before R2 storage was enabled.
    const absolutePath = this.resolveSafePath(key);

    try {
      await access(absolutePath);
    } catch {
      throw new AppError('Receipt file not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = mimeTypeByExtension[extension];
    if (!mimeType) {
      throw new AppError('Receipt file not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
    }

    return { key, absolutePath, mimeType, extension };
  }

  async remove(key: string | null): Promise<void> {
    if (!key) {
      return;
    }

    if (this.isR2ReceiptKey(key)) {
      try {
        const client = this.createR2Client();
        await client.send(new DeleteObjectCommand({
          Bucket: envConfig.r2.bucketName,
          Key: key,
        }));
      } catch {
        // Object cleanup is best effort after the database state has been committed.
      }
      return;
    }

    try {
      await unlink(this.resolveSafePath(key));
    } catch {
      // File cleanup is best effort after the database state has been committed.
    }
  }

  private createR2Client(): S3Client {
    const config = envConfig.r2;
    if (
      !config.accountId
      || !config.bucketName
      || !config.accessKeyId
      || !config.secretAccessKey
    ) {
      throw new AppError(
        'Cloudflare R2 storage is not configured',
        503,
        ERROR_CODE.STORAGE_NOT_CONFIGURED,
      );
    }

    return new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private isR2ReceiptKey(key: string): boolean {
    return /^receipts\/[0-9a-f-]+\/[0-9a-f-]+\.(?:jpg|png|webp|pdf)$/i.test(key);
  }

  private resolveSafePath(key: string): string {
    const normalizedKey = key.replace(/\\/g, '/');
    const absolutePath = path.resolve(this.rootDir, normalizedKey);
    const rootPrefix = `${this.rootDir}${path.sep}`;

    if (!absolutePath.startsWith(rootPrefix)) {
      throw new AppError('Receipt file not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
    }

    return absolutePath;
  }

  private hasValidSignature(mimeType: string, buffer: Buffer): boolean {
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff;
    }

    if (mimeType === 'image/png') {
      return buffer.length >= 8
        && buffer.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
    }

    if (mimeType === 'image/webp') {
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }

    if (mimeType === 'application/pdf') {
      return buffer.length >= 5
        && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    }

    return false;
  }
}
