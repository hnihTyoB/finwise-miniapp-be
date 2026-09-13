import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
} from '@prisma/client';
import { z } from 'zod';

export const notificationOverviewQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  dateTo: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export const adminDeliveryQuerySchema = z.object({
  channel: z.nativeEnum(NotificationChannel).optional(),
  status: z.nativeEnum(NotificationDeliveryStatus).optional(),
  type: z.nativeEnum(NotificationType).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  dateTo: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'nextAttemptAt', 'sentAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const adminTemplateQuerySchema = z.object({
  type: z.nativeEnum(NotificationType).optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  language: z.string().trim().max(10).optional(),
  isActive: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
});

export const updateTemplateSchema = z.object({
  titleTemplate: z.string().trim().min(1).max(200).optional(),
  bodyTemplate: z.string().trim().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const updateChannelConfigSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  zaloEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
});

export const adminParamIdSchema = z.object({
  id: z.string().uuid('Invalid ID parameter format'),
});
