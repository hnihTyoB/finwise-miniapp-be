import { randomUUID } from 'crypto';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';
import { LoggerService } from '../../common/services/logger.service';
import {
  AvatarContentType,
  CreatePresignedUploadDto,
  PresignedUploadDto,
} from './upload.dto';

const EXTENSION_BY_CONTENT_TYPE: Record<AvatarContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class UploadService {
  private readonly logger = new LoggerService('UploadService');

  async createPresignedUpload(
    userId: string,
    data: CreatePresignedUploadDto,
  ): Promise<PresignedUploadDto> {
    const config = envConfig.r2;
    if (
      !config.accountId
      || !config.bucketName
      || !config.accessKeyId
      || !config.secretAccessKey
      || !config.publicBaseUrl
    ) {
      throw new AppError(
        'Cloudflare R2 storage is not configured',
        503,
        ERROR_CODE.STORAGE_NOT_CONFIGURED,
      );
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[data.contentType];
    const objectKey = `avatars/${userId}/${randomUUID()}.${extension}`;
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      ContentType: data.contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: config.presignedUrlExpiresInSeconds,
    });
    const publicPath = objectKey
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    return {
      uploadUrl,
      publicUrl: `${config.publicBaseUrl}/${publicPath}`,
      objectKey,
      expiresIn: config.presignedUrlExpiresInSeconds,
      requiredHeaders: {
        'Content-Type': data.contentType,
      },
    };
  }

  async deleteFileByUrl(url: string): Promise<void> {
    if (!url) return;

    const config = envConfig.r2;
    if (
      !config.accountId
      || !config.bucketName
      || !config.accessKeyId
      || !config.secretAccessKey
    ) {
      return;
    }

    try {
      let objectKey = '';
      if (config.publicBaseUrl && url.startsWith(config.publicBaseUrl)) {
        objectKey = url.substring(config.publicBaseUrl.length).replace(/^\/+/, '');
      } else {
        const avatarIdx = url.indexOf('avatars/');
        if (avatarIdx !== -1) {
          objectKey = url.substring(avatarIdx);
        }
      }

      if (!objectKey) return;

      objectKey = decodeURIComponent(objectKey);

      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });

      const command = new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      });

      await client.send(command);
      this.logger.info(`Deleted old cloud storage file: ${objectKey}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file from R2 (${url}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
