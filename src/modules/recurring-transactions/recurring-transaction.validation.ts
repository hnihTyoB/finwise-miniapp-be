import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertBusinessDate } from '../../common/date-time/business-time';

const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE']);
const frequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const missedRunPolicySchema = z.enum(['SKIP', 'CATCH_UP']);
const amountSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Amount must be a positive decimal string with at most 16 integer digits and 2 decimal places',
  )
  .refine((value) => new Prisma.Decimal(value).greaterThan(0), 'Amount must be greater than zero');
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .transform((value, context) => {
    try {
      return assertBusinessDate(value);
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });
const nullableDescriptionSchema = z.string().trim().max(500).nullable();
const nullableLocationSchema = z.string().trim().max(255).nullable();

const scheduleFields = {
  walletId: z.string().uuid('Invalid wallet id'),
  categoryId: z.string().uuid('Invalid category id'),
  amount: amountSchema,
  type: transactionTypeSchema,
  description: nullableDescriptionSchema.optional(),
  location: nullableLocationSchema.optional(),
  frequency: frequencySchema,
  repeatInterval: z.coerce.number().int().min(1).max(365).default(1),
  anchorDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  missedRunPolicy: missedRunPolicySchema.default('SKIP'),
  remindDaysBefore: z.coerce.number().int().min(0).max(30).nullable().optional(),
};

export const recurringTransactionParamsSchema = z.object({
  id: z.string().uuid('Invalid recurring transaction id'),
});

export const findRecurringTransactionsSchema = z.object({
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createRecurringTransactionSchema = z
  .object({
    ...scheduleFields,
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => !data.endDate || data.endDate >= data.anchorDate, {
    path: ['endDate'],
    message: 'endDate must be greater than or equal to anchorDate',
  });

export const updateRecurringTransactionSchema = z
  .object({
    walletId: scheduleFields.walletId.optional(),
    categoryId: scheduleFields.categoryId.optional(),
    amount: scheduleFields.amount.optional(),
    type: scheduleFields.type.optional(),
    description: scheduleFields.description,
    location: scheduleFields.location,
    frequency: scheduleFields.frequency.optional(),
    repeatInterval: z.coerce.number().int().min(1).max(365).optional(),
    anchorDate: scheduleFields.anchorDate.optional(),
    endDate: scheduleFields.endDate,
    missedRunPolicy: scheduleFields.missedRunPolicy.optional(),
    remindDaysBefore: scheduleFields.remindDaysBefore,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const recurringTransactionPreviewSchema = z.object({
  count: z.coerce.number().int().min(1).max(24).optional().default(6),
  from: dateSchema.optional(),
});

export const recurringTransactionHistorySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const convertSubscriptionToRecurringTransactionSchema = z.object({
  merchantName: z.string().trim().min(1).max(100),
  walletId: z.string().uuid('Invalid wallet id'),
  categoryId: z.string().uuid('Invalid category id'),
  amount: amountSchema,
  frequency: frequencySchema,
  nextExpectedAt: dateSchema,
});
