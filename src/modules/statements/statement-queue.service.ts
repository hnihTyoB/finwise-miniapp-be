import { Queue, Worker, Job } from 'bullmq';
import { envConfig } from '../../config/env.config';
import { prisma } from '../../database/prisma.client';
import { StatementJobStatus, StatementExportFormat } from '@prisma/client';
import { StatementRepository } from './statement.repository';
import { TransactionRepository } from '../transactions/transaction.repository';
import { buildExcelBuffer } from './exporters/excel-exporter';
import { buildPdfBuffer } from './exporters/pdf-exporter';
import { buildCsvBuffer } from './exporters/csv-exporter';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType, NotificationPriority, NotificationSourceType } from '@prisma/client';
import { formatZaloNotificationText, ZaloBotService } from '../../common/services/zalo-bot.service';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ExportTransactionRow, ExportSummary } from './statement.dto';
import { Prisma } from '@prisma/client';

export const STATEMENT_QUEUE_NAME = 'finwise-statement-export';

export interface StatementJobPayload {
  statementJobId: string;
  userId: string;
  walletId?: string;
  dateFrom: string;     // ISO date YYYY-MM-DD
  dateTo: string;       // ISO date YYYY-MM-DD
  format: StatementExportFormat;
  password?: string;
  verificationCode: string;
}

export class StatementQueueService {
  private queue: Queue<StatementJobPayload> | null = null;
  private worker: Worker<StatementJobPayload> | null = null;
  private isInitialized = false;

  private readonly stmtRepo = new StatementRepository();
  private readonly txRepo = new TransactionRepository();
  private readonly zaloBotService = new ZaloBotService();
  private readonly notificationService = new NotificationService();

  constructor() {
    this.init();
  }

  private init() {
    if (this.isInitialized) return;

    const redisEnabled = envConfig.redis.enabled;
    if (!redisEnabled) {
      console.log('[StatementQueue] Redis disabled — queue initialized in direct mode');
      this.isInitialized = true;
      return;
    }

    const isTls = envConfig.redis.url.startsWith('rediss://');
    const connection: any = {
      host: envConfig.redis.host,
      port: envConfig.redis.port,
      username: envConfig.redis.username,
      password: envConfig.redis.password,
      tls: isTls ? {} : undefined,
      maxRetriesPerRequest: null,
    };

    try {
      this.queue = new Queue<StatementJobPayload>(STATEMENT_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      });

      this.queue.on('error', (err) => {
        console.warn('[StatementQueue] Queue error:', err.message);
      });

      this.worker = new Worker<StatementJobPayload>(
        STATEMENT_QUEUE_NAME,
        async (job: Job<StatementJobPayload>) => {
          await this.processExportJob(job.data);
        },
        {
          connection,
          concurrency: envConfig.statementExport.concurrency,
        },
      );

      this.worker.on('error', (err) => {
        console.warn('[StatementQueue] Worker error:', err.message);
      });

      this.worker.on('failed', (job, err) => {
        console.error(`[StatementQueue] Job ${job?.id} failed:`, err.message);
        if (job?.data?.statementJobId) {
          this.stmtRepo.updateStatus(job.data.statementJobId, StatementJobStatus.FAILED, {
            error: err.message,
            completedAt: new Date(),
          }).catch(() => {});
        }
      });

      this.isInitialized = true;
    } catch (err) {
      console.error('[StatementQueue] Failed to initialize:', err);
      this.isInitialized = true;
    }
  }

  async enqueue(payload: StatementJobPayload): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(`stmt:${payload.statementJobId}`, payload, {
          jobId: payload.statementJobId,
        });
        return;
      } catch (err) {
        console.warn('[StatementQueue] Failed to enqueue, falling back to setImmediate:', err);
      }
    }
    // Fallback: process in-process without queue
    setImmediate(() => {
      this.processExportJob(payload).catch((err) => {
        console.error('[StatementQueue] In-process fallback error:', err);
      });
    });
  }

  async close(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }

  // ─── Core export processing ────────────────────────────────────────────────

  private async processExportJob(payload: StatementJobPayload): Promise<void> {
    const { statementJobId, userId, walletId, format, password, verificationCode } = payload;
    const dateFrom = new Date(payload.dateFrom);
    const dateTo = new Date(payload.dateTo);

    await this.stmtRepo.updateStatus(statementJobId, StatementJobStatus.PROCESSING, {
      startedAt: new Date(),
    });

    try {
      // ── Fetch user + wallet info ────────────────────────────────────────
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, notificationSetting: { select: { zaloBotChatId: true } } },
      });

      const wallet = walletId
        ? await prisma.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true, name: true, currency: true, balance: true } })
        : null;

      // ── Opening balance ────────────────────────────────────────────────
      // Sum all transactions before dateFrom for this wallet (or all wallets)
      const openingAgg = await prisma.transaction.groupBy({
        by: ['type'],
        where: {
          userId,
          ...(walletId ? { walletId } : {}),
          date: { lt: dateFrom },
        },
        _sum: { amount: true },
      });

      let openingBalance = new Prisma.Decimal(0);
      for (const g of openingAgg) {
        const amt = g._sum.amount ?? new Prisma.Decimal(0);
        if (g.type === 'INCOME') openingBalance = openingBalance.add(amt);
        else openingBalance = openingBalance.sub(amt);
      }

      // ── Collect all rows via cursor-based pagination ────────────────────
      const BATCH_SIZE = envConfig.statementExport.batchSize;
      const allRows: ExportTransactionRow[] = [];
      let cursor: { date: Date; id: string } | undefined;
      let totalIncome = new Prisma.Decimal(0);
      let totalExpense = new Prisma.Decimal(0);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { records, nextCursor } = await this.txRepo.findBatchForExport({
          userId,
          walletId,
          dateFrom,
          dateTo,
          cursor,
          batchSize: BATCH_SIZE,
        });

        for (const rec of records) {
          allRows.push({
            id: rec.id,
            date: rec.date,
            walletName: rec.wallet.name,
            currency: rec.wallet.currency,
            categoryName: rec.category.name,
            categoryType: rec.category.type as 'INCOME' | 'EXPENSE',
            amount: rec.amount.toFixed(2),
            description: rec.description,
            location: rec.location,
          });
          if (rec.type === 'INCOME') totalIncome = totalIncome.add(rec.amount);
          else totalExpense = totalExpense.add(rec.amount);
        }

        if (!nextCursor) break;
        cursor = nextCursor;
      }

      const netSavings = totalIncome.sub(totalExpense);
      const closingBalance = openingBalance.add(netSavings);
      const currency = wallet?.currency ?? (allRows[0]?.currency ?? 'VND');

      const summary: ExportSummary = {
        openingBalance: openingBalance.toFixed(2),
        totalIncome: totalIncome.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        netSavings: netSavings.toFixed(2),
        closingBalance: closingBalance.toFixed(2),
        recordCount: allRows.length,
        currency,
        dateFrom,
        dateTo,
        userName: user?.fullName ?? null,
        walletName: wallet?.name ?? null,
      };

      // ── Generate file buffer ───────────────────────────────────────────
      const ext = format.toLowerCase() as 'xlsx' | 'pdf' | 'csv';
      let fileBuffer: Buffer;

      const appUrl = process.env.APP_URL || 'http://localhost:7777';
      const verifyUrl = `${appUrl}/api/v1/statements/verify/${verificationCode}`;

      if (format === StatementExportFormat.XLSX) {
        fileBuffer = await buildExcelBuffer(allRows, summary, password);
      } else if (format === StatementExportFormat.PDF) {
        fileBuffer = await buildPdfBuffer(allRows, summary, verificationCode, verifyUrl, password);
      } else {
        fileBuffer = buildCsvBuffer(allRows, summary);
      }

      // ── Upload to R2/S3 ────────────────────────────────────────────────
      const r2Config = envConfig.r2;
      const fileKey = `statements/${userId}/${statementJobId}.${ext}`;
      const contentType = format === 'PDF'
        ? 'application/pdf'
        : format === 'XLSX'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';

      const EXPIRES_HOURS = envConfig.statementExport.expiryHours;
      const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 3600 * 1000);

      let downloadUrl: string | null = null;

      if (r2Config.accountId && r2Config.bucketName && r2Config.accessKeyId && r2Config.secretAccessKey) {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: r2Config.accessKeyId, secretAccessKey: r2Config.secretAccessKey },
        });

        await s3.send(new PutObjectCommand({
          Bucket: r2Config.bucketName,
          Key: fileKey,
          Body: fileBuffer,
          ContentType: contentType,
          Metadata: {
            'statement-job-id': statementJobId,
            'user-id': userId,
            'expires-at': expiresAt.toISOString(),
          },
        }));

        // Generate presigned download URL
        downloadUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: fileKey,
            ResponseContentDisposition: `attachment; filename="finwise-statement-${statementJobId.slice(0, 8)}.${ext}"`,
          }),
          { expiresIn: EXPIRES_HOURS * 3600 },
        );
      } else {
        // Fallback: save to local storage/exports/
        const localDir = `storage/exports/${userId}`;
        const { mkdirSync, writeFileSync } = await import('fs');
        mkdirSync(localDir, { recursive: true });
        writeFileSync(`${localDir}/${statementJobId}.${ext}`, fileBuffer);
        downloadUrl = `/api/v1/statements/jobs/${statementJobId}/download`;
      }

      // ── Update job as COMPLETED ───────────────────────────────────────
      await this.stmtRepo.updateStatus(statementJobId, StatementJobStatus.COMPLETED, {
        fileUrl: downloadUrl,
        fileKey,
        fileSize: fileBuffer.length,
        recordCount: allRows.length,
        expiresAt,
        completedAt: new Date(),
      });

      // ── Send In-App Notification ──────────────────────────────────────
      const periodStr = `${dateFrom.toISOString().slice(0, 10)} - ${dateTo.toISOString().slice(0, 10)}`;
      await this.notificationService.create({
        userId,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.NORMAL,
        sourceType: NotificationSourceType.SYSTEM,
        sourceId: statementJobId,
        title: 'Sao kê tài chính của bạn đã sẵn sàng',
        message: `Sao kê từ ${periodStr} (${format}, ${allRows.length} giao dịch) đã được tạo xong. Nhấn để tải về (liên kết hiệu lực trong ${EXPIRES_HOURS} giờ).`,
        actionUrl: `/statements/jobs/${statementJobId}`,
        dedupKey: `statement:${statementJobId}:completed`,
      });

      // ── Send Zalo notification ────────────────────────────────────────
      const chatId = user?.notificationSetting?.zaloBotChatId;
      if (chatId && this.zaloBotService.isConfigured()) {
        const text = formatZaloNotificationText(
          '📊 Sao kê tài chính FinWise đã sẵn sàng!',
          [
            `📅 Kỳ sao kê: ${periodStr}`,
            `📄 Định dạng: ${format} (${allRows.length} giao dịch)`,
            password ? '🔒 File được bảo vệ mật khẩu theo yêu cầu.' : '',
            `\n📥 Tải file tại: ${downloadUrl}`,
            `⚠️ Liên kết tải sẽ hết hạn sau ${EXPIRES_HOURS} giờ.`,
          ].filter(Boolean).join('\n'),
          downloadUrl ?? undefined,
        );
        this.zaloBotService.sendMessage(chatId, text).catch((err) => {
          console.warn('[StatementQueue] Zalo notification failed:', err.message);
        });
      }
    } catch (err: any) {
      await this.stmtRepo.updateStatus(statementJobId, StatementJobStatus.FAILED, {
        error: err?.message ?? 'Unknown export error',
        completedAt: new Date(),
      });
      throw err;
    }
  }
}

export const statementQueueService = new StatementQueueService();
