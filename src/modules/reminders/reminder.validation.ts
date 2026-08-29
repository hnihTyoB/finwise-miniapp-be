import { z } from 'zod';

const reminderTypeSchema = z.enum(['GENERAL', 'RECURRING_PAYMENT']);
const reminderFrequencySchema = z.enum(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const dateSchema = z
  .string()
  .datetime({ offset: true, message: 'Date must be a valid ISO 8601 date-time' })
  .transform((value) => new Date(value));
const nullableText = (max: number) => z
  .union([z.string().trim().max(max), z.null()])
  .transform((value) => value === '' ? null : value);
const actionUrlSchema = z
  .union([
    z.string().trim().max(500).refine(
      (value) => value.startsWith('/') || /^https:\/\//i.test(value),
      'actionUrl must be an app-relative path or HTTPS URL',
    ),
    z.null(),
  ])
  .transform((value) => value === '' ? null : value);

export const reminderParamsSchema = z.object({
  id: z.string().uuid('Invalid reminder id'),
});

export const findRemindersSchema = z.object({
  type: reminderTypeSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).refine(
  (data) => !data.dueFrom || !data.dueTo || data.dueTo >= data.dueFrom,
  { path: ['dueTo'], message: 'dueTo must be greater than or equal to dueFrom' },
);

export const createReminderSchema = z
  .object({
    type: reminderTypeSchema.optional().default('GENERAL'),
    title: z.string().trim().min(1, 'Title is required').max(160),
    message: nullableText(2000).optional(),
    remindAt: dateSchema,
    frequency: reminderFrequencySchema.optional().default('ONCE'),
    repeatInterval: z.coerce.number().int().min(1).max(365).optional().default(1),
    endAt: dateSchema.nullable().optional(),
    actionUrl: actionUrlSchema.optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, context) => {
    if (data.endAt && data.endAt <= data.remindAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'endAt must be after remindAt',
      });
    }
    if (data.frequency === 'ONCE' && data.endAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'endAt is only supported for recurring reminders',
      });
    }
  });

export const updateReminderSchema = z
  .object({
    type: reminderTypeSchema.optional(),
    title: z.string().trim().min(1, 'Title cannot be empty').max(160).optional(),
    message: nullableText(2000).optional(),
    remindAt: dateSchema.optional(),
    frequency: reminderFrequencySchema.optional(),
    repeatInterval: z.coerce.number().int().min(1).max(365).optional(),
    endAt: dateSchema.nullable().optional(),
    actionUrl: actionUrlSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
