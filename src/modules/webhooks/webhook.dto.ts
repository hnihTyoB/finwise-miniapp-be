import { WebhookStatus, WebhookDeliveryStatus } from '@prisma/client';

export interface CreateWebhookDto {
  url: string;
  description?: string;
  events?: string[];
}

export interface UpdateWebhookDto {
  url?: string;
  description?: string;
  events?: string[];
  status?: WebhookStatus;
}

export interface WebhookEndpointResponseDto {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: WebhookStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookResponseDto {
  endpoint: WebhookEndpointResponseDto;
  secret: string; // Trả về raw webhook signing secret chỉ 1 lần duy nhất khi tạo
}

export interface WebhookDeliveryResponseDto {
  id: string;
  eventId: string;
  event: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  responseBody: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}
