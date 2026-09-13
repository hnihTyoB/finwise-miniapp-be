import { z } from 'zod';

const notificationTypeSchema = z.enum([
  'BUDGET_NEAR_LIMIT',
  'BUDGET_EXCEEDED',
  'SAVING_GOAL_NEAR_TARGET',
  'SAVING_GOAL_ACHIEVED',
  'SAVING_GOAL_DUE_SOON',
  'RECURRING_PAYMENT_DUE',
  'UNUSUAL_TRANSACTION',
  'USER_REMINDER',
  'SYSTEM',
]);
const notificationPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const notificationChannelSchema = z.enum(['IN_APP', 'EMAIL', 'ZALO', 'PUSH']);

export const notificationParamsSchema = z.object({
  id: z.string().uuid('Invalid notification id'),
});

export const findNotificationsSchema = z.object({
  type: notificationTypeSchema.optional(),
  priority: notificationPrioritySchema.optional(),
  isRead: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const updateNotificationSettingSchema = z
  .object({
    channels: z
      .array(notificationChannelSchema)
      .min(1, 'At least one notification channel is required')
      .max(4)
      .transform((channels) => [...new Set(channels)])
      .optional(),
    /**
     * chat_id của Zalo Bot nhận được khi user nhắn tin cho bot.
     * Truyền null để xóa liên kết Zalo Bot.
     */
    zaloBotChatId: z
      .string()
      .max(100, 'Zalo Bot Chat ID must not exceed 100 characters')
      .trim()
      .nullable()
      .optional(),
    budgetAlertsEnabled: z.boolean().optional(),
    savingGoalAlertsEnabled: z.boolean().optional(),
    reminderAlertsEnabled: z.boolean().optional(),
    unusualTxnAlertsEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

