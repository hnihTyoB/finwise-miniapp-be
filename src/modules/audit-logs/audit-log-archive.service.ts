import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { envConfig } from '../../config/env.config';
import { prisma } from '../../database/prisma.client';
import { LoggerService } from '../../common/services/logger.service';
import { auditLogRepository } from './audit-log.repository';
import { SystemSettingService } from '../system-settings/system-setting.service';

export interface ArchiveCleanupOptions {
  retentionDays?: number;
  actorId?: string;
  triggerSource?: 'CRON' | 'MANUAL';
}

export interface ArchiveCleanupResult {
  success: boolean;
  archivedCount: number;
  cutoffDate: string;
  retentionDays: number;
  archiveFileName?: string;
  archivePath?: string;
  archiveFileSize?: number;
  r2Uploaded: boolean;
  r2Key?: string | null;
  message?: string;
}

export class AuditLogArchiveService {
  private readonly logger = new LoggerService('AuditLogArchiveService');
  private readonly systemSettingService = new SystemSettingService();

  async archiveAndCleanup(options?: ArchiveCleanupOptions): Promise<ArchiveCleanupResult> {
    let retentionDays = options?.retentionDays;

    if (!retentionDays || retentionDays <= 0) {
      try {
        retentionDays = await this.systemSettingService.getNumber(
          'security.audit_log_retention_days',
          envConfig.auditLogs.retentionDays,
        );
      } catch {
        retentionDays = envConfig.auditLogs.retentionDays;
      }
    }

    if (!retentionDays || retentionDays <= 0) {
      retentionDays = 30;
    }

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDateIso = cutoffDate.toISOString();

    const count = await prisma.auditLog.count({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    if (count === 0) {
      this.logger.info(`No audit logs found older than ${retentionDays} days (cutoff: ${cutoffDateIso})`);
      return {
        success: true,
        archivedCount: 0,
        cutoffDate: cutoffDateIso,
        retentionDays,
        r2Uploaded: false,
        message: 'No audit logs older than retention period',
      };
    }

    this.logger.info(`Found ${count} audit logs older than ${retentionDays} days to archive and purge.`);

    const records = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const archivePayload = {
      metadata: {
        archiveTimestamp: new Date().toISOString(),
        retentionDays,
        cutoffDate: cutoffDateIso,
        recordCount: records.length,
        version: '1.0',
      },
      records,
    };

    const jsonString = JSON.stringify(archivePayload);
    const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));

    const dateSegment = cutoffDateIso.slice(0, 10).replace(/-/g, '');
    const fileName = `audit-logs-${dateSegment}-${Date.now()}.json.gz`;
    const archiveDir = path.resolve(process.cwd(), envConfig.auditLogs.archiveDir);

    await fs.promises.mkdir(archiveDir, { recursive: true });
    const localFilePath = path.join(archiveDir, fileName);
    await fs.promises.writeFile(localFilePath, compressedBuffer);

    let r2Uploaded = false;
    let r2Key: string | null = null;
    const r2Config = envConfig.r2;

    if (
      r2Config.accountId
      && r2Config.bucketName
      && r2Config.accessKeyId
      && r2Config.secretAccessKey
    ) {
      try {
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2Config.accessKeyId,
            secretAccessKey: r2Config.secretAccessKey,
          },
        });

        r2Key = `archives/audit-logs/${fileName}`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: r2Key,
            Body: compressedBuffer,
            ContentType: 'application/gzip',
            Metadata: {
              'record-count': String(records.length),
              'retention-days': String(retentionDays),
              'cutoff-date': cutoffDateIso,
            },
          }),
        );
        r2Uploaded = true;
        this.logger.info(`Uploaded archive file to Cloudflare R2: ${r2Key}`);
      } catch (r2Error) {
        this.logger.warn(
          `Failed to upload archive to Cloudflare R2 (local archive preserved): ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`,
        );
      }
    }

    const recordIds = records.map((r) => r.id);
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < recordIds.length; i += CHUNK_SIZE) {
      const chunk = recordIds.slice(i, i + CHUNK_SIZE);
      await prisma.auditLog.deleteMany({
        where: {
          id: {
            in: chunk,
          },
        },
      });
    }

    await auditLogRepository.createAuditLog({
      actorId: options?.actorId,
      action: 'AUDIT_LOGS_ARCHIVE_CLEANUP',
      targetType: 'AUDIT_LOG',
      newState: {
        triggerSource: options?.triggerSource || 'CRON',
        retentionDays,
        cutoffDate: cutoffDateIso,
        archivedCount: records.length,
        archiveFileName: fileName,
        archiveFileSize: compressedBuffer.length,
        r2Uploaded,
        r2Key,
      },
    });

    this.logger.info(
      `Successfully archived ${records.length} logs to ${fileName} (${compressedBuffer.length} bytes) and deleted from database.`,
    );

    return {
      success: true,
      archivedCount: records.length,
      cutoffDate: cutoffDateIso,
      retentionDays,
      archiveFileName: fileName,
      archivePath: localFilePath,
      archiveFileSize: compressedBuffer.length,
      r2Uploaded,
      r2Key,
    };
  }
}

export const auditLogArchiveService = new AuditLogArchiveService();
