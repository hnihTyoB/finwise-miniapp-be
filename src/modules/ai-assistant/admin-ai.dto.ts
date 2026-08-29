import { AiRequestStatus } from '@prisma/client';

export type AiFeatureKey = 'assistant' | 'forecasting' | 'anomalies' | 'query';

export interface AiFeatureStatusDto {
  key: AiFeatureKey;
  name: string;
  enabled: boolean;
  status: 'ENABLED' | 'DISABLED' | 'DEGRADED';
  settingKey: string;
  provider: string;
  model: string;
  description: string;
}

export interface AiUsageSummaryDto {
  period: 'today' | 'week' | 'month';
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  rateLimitEvents: number;
  successRate: number; // percentage e.g. 98.2
  avgLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isUsageAvailable: boolean;
  byFeature: Array<{
    feature: string;
    total: number;
    success: number;
    failed: number;
    avgLatencyMs: number;
    totalTokens: number;
  }>;
}

export interface AiRequestLogQueryDto {
  feature?: string;
  status?: AiRequestStatus;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface AiRequestLogItemDto {
  id: string;
  userId: string | null;
  feature: string;
  provider: string;
  model: string;
  status: AiRequestStatus;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ToggleAiFeatureDto {
  enabled: boolean;
}

export interface UpdateAiRateLimitDto {
  maxRequests: number;
  windowMs: number;
}

export interface AiRateLimitConfigDto {
  maxRequests: number;
  windowMs: number;
}
