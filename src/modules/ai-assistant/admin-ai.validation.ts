import { AiRequestStatus } from '@prisma/client';
import { z } from 'zod';

export const toggleAiFeatureSchema = z.object({
  enabled: z.boolean(),
});

export const updateAiRateLimitSchema = z.object({
  maxRequests: z.number().int().min(1).max(1000),
  windowMs: z.number().int().min(1000).max(86400000),
});

export const aiUsageSummaryQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month']).default('today'),
});

export const aiRequestLogQuerySchema = z.object({
  feature: z.string().trim().max(50).optional(),
  status: z.nativeEnum(AiRequestStatus).optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  dateTo: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
