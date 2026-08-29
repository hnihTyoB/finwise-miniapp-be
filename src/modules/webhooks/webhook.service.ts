import crypto from 'crypto';
import { WebhookRepository } from './webhook.repository';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookEndpointResponseDto,
  CreateWebhookResponseDto,
  WebhookDeliveryResponseDto,
} from './webhook.dto';
import { generateWebhookSecret, encryptSecret } from '../../common/helpers/crypto.helper';
import { validateUrlAsync } from '../../common/helpers/url.helper';
import { webhookQueueService } from './webhook-queue.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class WebhookService {
  private readonly repository = new WebhookRepository();

  async createEndpoint(userId: string, data: CreateWebhookDto): Promise<CreateWebhookResponseDto> {
    // Validate target URL via DNS to reject private IP domains
    await validateUrlAsync(data.url);

    const rawSecret = generateWebhookSecret();
    const secretEncrypted = encryptSecret(rawSecret);

    const endpoint = await this.repository.create({
      userId,
      url: data.url,
      description: data.description,
      secretEncrypted,
      events: data.events || ['job.completed', 'job.failed'],
    });

    return {
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        description: endpoint.description,
        events: endpoint.events,
        status: endpoint.status,
        createdAt: endpoint.createdAt,
        updatedAt: endpoint.updatedAt,
      },
      secret: rawSecret,
    };
  }

  async getUserEndpoints(userId: string): Promise<WebhookEndpointResponseDto[]> {
    const endpoints = await this.repository.findByUserId(userId);
    return endpoints.map((e) => ({
      id: e.id,
      url: e.url,
      description: e.description,
      events: e.events,
      status: e.status,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  async updateEndpoint(userId: string, id: string, data: UpdateWebhookDto): Promise<WebhookEndpointResponseDto> {
    if (data.url) {
      await validateUrlAsync(data.url);
    }

    const updated = await this.repository.update(id, userId, data);
    if (!updated) {
      throw new AppError('Webhook endpoint not found', 404, ERROR_CODE.WEBHOOK_NOT_FOUND);
    }

    return {
      id: updated.id,
      url: updated.url,
      description: updated.description,
      events: updated.events,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteEndpoint(userId: string, id: string): Promise<void> {
    const deleted = await this.repository.softDelete(id, userId);
    if (!deleted) {
      throw new AppError('Webhook endpoint not found', 404, ERROR_CODE.WEBHOOK_NOT_FOUND);
    }
  }

  async getEndpointDeliveries(userId: string, id: string): Promise<WebhookDeliveryResponseDto[]> {
    const endpoint = await this.repository.findByIdAndUserId(id, userId);
    if (!endpoint) {
      throw new AppError('Webhook endpoint not found', 404, ERROR_CODE.WEBHOOK_NOT_FOUND);
    }

    const deliveries = await this.repository.findDeliveriesByEndpointId(id);
    return deliveries.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      event: d.event,
      status: d.status,
      statusCode: d.statusCode,
      responseBody: d.responseBody,
      attemptCount: d.attemptCount,
      maxAttempts: d.maxAttempts,
      lastAttemptAt: d.lastAttemptAt,
      nextRetryAt: d.nextRetryAt,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt,
    }));
  }

  async testPing(userId: string, id: string): Promise<{ deliveryId: string; message: string }> {
    const endpoint = await this.repository.findByIdAndUserId(id, userId);
    if (!endpoint) {
      throw new AppError('Webhook endpoint not found', 404, ERROR_CODE.WEBHOOK_NOT_FOUND);
    }

    const eventId = `evt_${crypto.randomUUID()}`;
    const payload = {
      message: 'Ping from FinWise Webhook Test',
      timestamp: new Date().toISOString(),
      endpointId: endpoint.id,
    };

    const delivery = await this.repository.createDelivery({
      webhookEndpointId: endpoint.id,
      eventId,
      event: 'ping',
      payload,
    });

    await webhookQueueService.enqueue({
      deliveryId: delivery.id,
      webhookEndpointId: endpoint.id,
      url: endpoint.url,
      secretEncrypted: endpoint.secretEncrypted,
      event: 'ping',
      eventId,
      payload,
    });

    return {
      deliveryId: delivery.id,
      message: 'Test ping event enqueued for delivery',
    };
  }

  async retryDelivery(userId: string, endpointId: string, deliveryId: string): Promise<{ message: string }> {
    const delivery = await this.repository.findDeliveryById(deliveryId, userId);
    if (!delivery || delivery.webhookEndpointId !== endpointId) {
      throw new AppError('Webhook delivery not found', 404, ERROR_CODE.WEBHOOK_NOT_FOUND);
    }

    await this.repository.resetDeliveryForRetry(delivery.id);

    await webhookQueueService.enqueue({
      deliveryId: delivery.id,
      webhookEndpointId: delivery.endpoint.id,
      url: delivery.endpoint.url,
      secretEncrypted: delivery.endpoint.secretEncrypted,
      event: delivery.event,
      eventId: delivery.eventId,
      payload: delivery.payload,
    });

    return {
      message: 'Webhook delivery re-enqueued for delivery',
    };
  }

  /**
   * Phát tán event tới tất cả active Webhook endpoints của một user_id.
   */
  async dispatchEventToUser(userId: string, event: string, payload: any): Promise<number> {
    const endpoints = await this.repository.findActiveByUserId(userId);
    const matchingEndpoints = endpoints.filter((e) => e.events.includes(event) || e.events.includes('*'));

    const eventId = `evt_${crypto.randomUUID()}`;

    for (const endpoint of matchingEndpoints) {
      const delivery = await this.repository.createDelivery({
        webhookEndpointId: endpoint.id,
        eventId,
        event,
        payload,
      });

      await webhookQueueService.enqueue({
        deliveryId: delivery.id,
        webhookEndpointId: endpoint.id,
        url: endpoint.url,
        secretEncrypted: endpoint.secretEncrypted,
        event,
        eventId,
        payload,
      });
    }

    return matchingEndpoints.length;
  }
}

export const webhookService = new WebhookService();
