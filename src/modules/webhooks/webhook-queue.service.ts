import { Queue, Worker, Job } from 'bullmq';
import { envConfig } from '../../config/env.config';
import { prisma } from '../../database/prisma.client';
import { decryptSecret, signWebhookPayload } from '../../common/helpers/crypto.helper';
import { safeFetch } from '../../common/helpers/url.helper';
import { WebhookDeliveryStatus } from '@prisma/client';

export interface WebhookJobData {
  deliveryId: string;
  webhookEndpointId: string;
  url: string;
  secretEncrypted: string;
  event: string;
  eventId: string;
  payload: any;
}

export class WebhookQueueService {
  private queue: Queue<WebhookJobData> | null = null;
  private worker: Worker<WebhookJobData> | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.isInitialized) return;

    const redisHost = envConfig.redis.host;
    const redisPort = envConfig.redis.port;
    const redisPassword = envConfig.redis.password;
    const redisEnabled = envConfig.redis.enabled;

    if (!redisEnabled) {
      console.log('[WebhookQueue] Redis disabled, queue initialized in direct mode');
      this.isInitialized = true;
      return;
    }

    const isTls = envConfig.redis.url.startsWith('rediss://');
    const connection = {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      tls: isTls ? {} : undefined,
      maxRetriesPerRequest: null,
    };

    try {
      this.queue = new Queue<WebhookJobData>('finwise-webhook-deliveries', {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s, 16s, 32s
          },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 1000 },
        },
      });

      this.worker = new Worker<WebhookJobData>(
        'finwise-webhook-deliveries',
        async (job: Job<WebhookJobData>) => {
          await this.processJob(job.data, job.attemptsMade + 1);
        },
        {
          connection,
          concurrency: 5,
          limiter: {
            max: 20,
            duration: 1000,
          },
        },
      );

      this.worker.on('failed', (job, err) => {
        console.warn(`[WebhookQueue] Job ${job?.id} failed on attempt ${job?.attemptsMade}:`, err.message);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('[WebhookQueue] Failed to initialize BullMQ worker:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Đưa webhook delivery vào BullMQ queue để gửi bất đồng bộ với cơ chế retry tự động.
   */
  async enqueue(data: WebhookJobData): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(`webhook:${data.event}:${data.deliveryId}`, data, {
          jobId: data.deliveryId,
        });
        return;
      } catch (err) {
        console.warn('[WebhookQueue] Failed to enqueue to BullMQ, falling back to direct delivery:', err);
      }
    }

    // Direct async delivery fallback if Redis queue is unavailable
    setImmediate(() => {
      this.processJob(data, 1).catch((err) => {
        console.error('[WebhookQueue] Direct delivery fallback failed:', err);
      });
    });
  }

  /**
   * Xử lý gửi Webhook HTTP request an toàn (SSRF protected + HMAC signed).
   */
  async processJob(data: WebhookJobData, attemptNumber: number): Promise<void> {
    const { deliveryId, url, secretEncrypted, event, eventId, payload } = data;
    const now = new Date();

    let secret: string;
    try {
      secret = decryptSecret(secretEncrypted);
    } catch (err: any) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: `Decryption error: ${err?.message || 'Invalid secret'}`,
          attemptCount: attemptNumber,
          lastAttemptAt: now,
        },
      });
      throw err;
    }

    const payloadString = JSON.stringify({
      id: eventId,
      event,
      timestamp: now.toISOString(),
      data: payload,
    });

    const { signature } = signWebhookPayload(payloadString, secret);

    try {
      const response = await safeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FinWise-Signature': signature,
          'X-FinWise-Event': event,
          'X-FinWise-Delivery-Id': deliveryId,
          'User-Agent': 'FinWise-Webhook-Worker/1.0',
        },
        body: payloadString,
        timeoutMs: 10000,
      });

      const isSuccess = response.status >= 200 && response.status < 300;

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: isSuccess ? WebhookDeliveryStatus.SUCCESS : WebhookDeliveryStatus.FAILED,
          statusCode: response.status,
          responseBody: response.body ? response.body.substring(0, 1000) : null,
          attemptCount: attemptNumber,
          lastAttemptAt: now,
          errorMessage: isSuccess ? null : `HTTP status ${response.status}`,
        },
      });

      if (!isSuccess) {
        throw new Error(`Webhook target responded with HTTP ${response.status}`);
      }
    } catch (error: any) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: error?.message || 'Network error',
          attemptCount: attemptNumber,
          lastAttemptAt: now,
          nextRetryAt: new Date(Date.now() + Math.min(2 ** attemptNumber * 2000, 60000)),
        },
      });

      throw error; // Re-throw to BullMQ to trigger retry backoff
    }
  }

  /**
   * Đóng worker và queue một cách an toàn khi shutdown server.
   */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }
}

export const webhookQueueService = new WebhookQueueService();
