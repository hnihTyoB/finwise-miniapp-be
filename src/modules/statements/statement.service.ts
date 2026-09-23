import * as fs from 'fs';
import * as path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StatementExportFormat } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';
import { uuidv7 } from '../../common/helpers/uuid.helper';
import { prisma } from '../../database/prisma.client';
import { StatementRepository } from './statement.repository';
import { statementQueueService } from './statement-queue.service';
import {
  CreateStatementExportDto,
  StatementJobResponseDto,
  StatementVerifyResponseDto,
} from './statement.dto';

export class StatementService {
  private readonly repository = new StatementRepository();

  async initiateExport(
    userId: string,
    dto: CreateStatementExportDto,
  ): Promise<StatementJobResponseDto> {
    // Validate wallet ownership if walletId provided
    if (dto.walletId) {
      const wallet = await prisma.wallet.findFirst({
        where: { id: dto.walletId, userId },
        select: { id: true },
      });
      if (!wallet) {
        throw new AppError('Wallet not found or access denied', 404, ERROR_CODE.NOT_FOUND);
      }
    }

    const dateFrom = new Date(dto.dateFrom);
    const dateTo = new Date(dto.dateTo);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      throw new AppError('Invalid date range', 400, ERROR_CODE.STATEMENT_DATE_RANGE_INVALID);
    }

    const verificationCode = `FW-${uuidv7().toUpperCase().replace(/-/g, '').slice(0, 16)}`;
    const format = dto.format as StatementExportFormat;

    const job = await this.repository.create({
      userId,
      walletId: dto.walletId,
      format,
      dateFrom,
      dateTo,
      isPasswordProtected: Boolean(dto.password),
      passwordHint: dto.passwordHint,
      verificationCode,
    });

    // Push to queue (non-blocking)
    await statementQueueService.enqueue({
      statementJobId: job.id,
      userId,
      walletId: dto.walletId,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      format,
      password: dto.password,
      verificationCode,
    });

    return this.toResponseDto(job, null, null);
  }

  async getJob(userId: string, jobId: string): Promise<StatementJobResponseDto> {
    const job = await this.repository.findByIdAndUserId(jobId, userId);
    if (!job) {
      throw new AppError('Statement job not found', 404, ERROR_CODE.STATEMENT_JOB_NOT_FOUND);
    }
    return this.toResponseDto(job, job.fileUrl, (job as any).wallet?.name ?? null);
  }

  async downloadStatement(
    userId: string,
    jobId: string,
    proxy = false,
  ): Promise<
    | { type: 'redirect'; url: string }
    | { type: 'file'; filePath: string; fileName: string; mimeType: string }
    | { type: 'stream'; stream: any; fileName: string; mimeType: string; contentLength?: number }
  > {
    const job = await this.repository.findByIdAndUserId(jobId, userId);
    if (!job) {
      throw new AppError('Statement job not found', 404, ERROR_CODE.STATEMENT_JOB_NOT_FOUND);
    }

    if (job.status !== 'COMPLETED') {
      throw new AppError('Statement file is not ready yet', 400, ERROR_CODE.STATEMENT_NOT_READY);
    }

    if (job.expiresAt && new Date() > job.expiresAt) {
      throw new AppError('Statement download link has expired', 410, ERROR_CODE.STATEMENT_EXPIRED);
    }

    const mimeTypes: Record<string, string> = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      csv: 'text/csv',
    };
    const ext = job.format.toLowerCase();
    const fileName = `finwise-statement-${job.id.slice(0, 8)}.${ext}`;
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // If proxy streaming requested and file is stored in Cloudflare R2
    const targetFileKey = job.fileKey || `statements/${job.userId}/${job.id}.${ext}`;
    if (proxy && envConfig.r2.bucketName && envConfig.r2.accountId) {
      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${envConfig.r2.accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: envConfig.r2.accessKeyId,
            secretAccessKey: envConfig.r2.secretAccessKey,
          },
        });
        const object = await s3.send(
          new GetObjectCommand({
            Bucket: envConfig.r2.bucketName,
            Key: targetFileKey,
          }),
        );
        if (object.Body) {
          return {
            type: 'stream',
            stream: object.Body,
            fileName,
            mimeType,
            contentLength: object.ContentLength,
          };
        }
      } catch (r2Err) {
        console.warn('[StatementService] R2 proxy stream failed, falling back:', r2Err);
      }
    }

    // External URL (Cloudflare R2 / S3 presigned)
    if (job.fileUrl && job.fileUrl.startsWith('http')) {
      return { type: 'redirect', url: job.fileUrl };
    }

    // Local file fallback
    const filePath = path.resolve(process.cwd(), 'storage/exports', userId, `${job.id}.${ext}`);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Statement export file not found on server', 404, ERROR_CODE.STATEMENT_FILE_NOT_FOUND);
    }

    return {
      type: 'file',
      filePath,
      fileName,
      mimeType,
    };
  }

  async listJobs(userId: string, page: number, limit: number) {
    const { jobs, total } = await this.repository.findManyByUserId(userId, page, limit);
    return {
      data: jobs.map((j) => this.toResponseDto(j, j.fileUrl, (j as any).wallet?.name ?? null)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async verifyStatement(code: string): Promise<StatementVerifyResponseDto> {
    const job = await this.repository.findByVerificationCode(code);
    if (!job) {
      return {
        isValid: false,
        verificationCode: code,
        userName: null,
        walletName: null,
        period: '—',
        recordCount: null,
        issuedAt: null,
        status: 'FAILED' as any,
      };
    }

    // Mask user name for privacy: Ng*** V** A
    const fullName = (job as any).user?.fullName ?? null;
    const maskedName = fullName ? maskName(fullName) : null;

    const from = job.dateFrom.toISOString().slice(0, 10);
    const to = job.dateTo.toISOString().slice(0, 10);

    return {
      isValid: job.status === 'COMPLETED',
      verificationCode: job.verificationCode,
      userName: maskedName,
      walletName: (job as any).wallet?.name ?? null,
      period: `${from} - ${to}`,
      recordCount: job.recordCount,
      issuedAt: job.completedAt?.toISOString() ?? null,
      status: job.status,
    };
  }

  private toResponseDto(
    job: any,
    fileUrl: string | null,
    walletName: string | null,
  ): StatementJobResponseDto {
    return {
      jobId: job.id,
      userId: job.userId,
      walletId: job.walletId ?? null,
      format: job.format,
      status: job.status,
      dateFrom: job.dateFrom instanceof Date ? job.dateFrom.toISOString().slice(0, 10) : String(job.dateFrom),
      dateTo: job.dateTo instanceof Date ? job.dateTo.toISOString().slice(0, 10) : String(job.dateTo),
      isPasswordProtected: job.isPasswordProtected,
      passwordHint: job.passwordHint ?? null,
      downloadUrl: fileUrl ?? null,
      fileSize: job.fileSize ?? null,
      recordCount: job.recordCount ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      checkStatusUrl: `/api/v1/statements/jobs/${job.id}`,
    };
  }
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.map((part, i) => {
    if (i === 0 || i === parts.length - 1) {
      // Keep first 2 chars, mask the rest
      return part.length <= 2 ? part : part.slice(0, 2) + '*'.repeat(part.length - 2);
    }
    return part[0] + '*'.repeat(Math.max(0, part.length - 1));
  }).join(' ');
}

export const statementService = new StatementService();
