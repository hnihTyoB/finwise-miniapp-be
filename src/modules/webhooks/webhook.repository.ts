import { prisma } from '../../database/prisma.client';
import { WebhookEndpoint, WebhookDelivery, WebhookStatus, WebhookDeliveryStatus } from '@prisma/client';

export class WebhookRepository {
  async create(data: {
    userId: string;
    url: string;
    description?: string;
    secretEncrypted: string;
    events: string[];
  }): Promise<WebhookEndpoint> {
    return prisma.webhookEndpoint.create({
      data: {
        userId: data.userId,
        url: data.url,
        description: data.description,
        secretEncrypted: data.secretEncrypted,
        events: data.events,
        status: WebhookStatus.ACTIVE,
      },
    });
  }

  async findByUserId(userId: string): Promise<WebhookEndpoint[]> {
    return prisma.webhookEndpoint.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByUserId(userId: string): Promise<WebhookEndpoint[]> {
    return prisma.webhookEndpoint.findMany({
      where: {
        userId,
        status: WebhookStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  async findByIdAndUserId(id: string, userId: string): Promise<WebhookEndpoint | null> {
    return prisma.webhookEndpoint.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });
  }

  async update(id: string, userId: string, data: Partial<{
    url: string;
    description: string;
    events: string[];
    status: WebhookStatus;
  }>): Promise<WebhookEndpoint | null> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    return prisma.webhookEndpoint.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string, userId: string): Promise<WebhookEndpoint | null> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    return prisma.webhookEndpoint.update({
      where: { id },
      data: {
        status: WebhookStatus.DISABLED,
        deletedAt: new Date(),
      },
    });
  }

  async createDelivery(data: {
    webhookEndpointId: string;
    eventId: string;
    event: string;
    payload: any;
  }): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.create({
      data: {
        webhookEndpointId: data.webhookEndpointId,
        eventId: data.eventId,
        event: data.event,
        payload: data.payload,
        status: WebhookDeliveryStatus.PENDING,
      },
    });
  }

  async findDeliveriesByEndpointId(endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findDeliveryById(deliveryId: string, userId: string): Promise<(WebhookDelivery & { endpoint: WebhookEndpoint }) | null> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });

    if (!delivery || delivery.endpoint.userId !== userId || delivery.endpoint.deletedAt !== null) {
      return null;
    }

    return delivery;
  }

  async resetDeliveryForRetry(deliveryId: string): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.PENDING,
        errorMessage: null,
        nextRetryAt: new Date(),
      },
    });
  }
}
