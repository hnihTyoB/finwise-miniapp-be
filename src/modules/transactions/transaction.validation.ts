import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertBusinessDate } from '../../common/date-time/business-time';

const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE']);
const amountSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Amount must be a positive decimal string with at most 16 integer digits and 2 decimal places',
  )
  .refine(
    (value) => new Prisma.Decimal(value).greaterThan(0),
    'Amount must be greater than zero',
  );
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

export const transactionParamsSchema = z.object({
  id: z.string().uuid('Invalid transaction id'),
});

export const findTransactionsSchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    walletId: z.string().uuid('Invalid wallet id').optional(),
    categoryId: z.string().uuid('Invalid category id').optional(),
    type: transactionTypeSchema.optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    minAmount: amountSchema.optional(),
    maxAmount: amountSchema.optional(),
    sortBy: z
      .enum(['amount', 'date', 'description', 'createdAt', 'updatedAt'])
      .optional()
      .default('date'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .refine(
    (data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo,
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateFrom'],
    },
  )
  .refine(
    (data) => (
      data.minAmount === undefined
      || data.maxAmount === undefined
      || new Prisma.Decimal(data.minAmount).lessThanOrEqualTo(data.maxAmount)
    ),
    {
      message: 'minAmount must be less than or equal to maxAmount',
      path: ['minAmount'],
    },
  );

export const createTransactionSchema = z.object({
  walletId: z.string().uuid('Invalid wallet id'),
  categoryId: z.string().uuid('Invalid category id'),
  amount: amountSchema,
  type: transactionTypeSchema,
  description: nullableDescriptionSchema.optional(),
  location: nullableLocationSchema.optional(),
  date: dateSchema,
});

export const updateTransactionSchema = z
  .object({
    walletId: z.string().uuid('Invalid wallet id').optional(),
    categoryId: z.string().uuid('Invalid category id').optional(),
    amount: amountSchema.optional(),
    type: transactionTypeSchema.optional(),
    description: nullableDescriptionSchema.optional(),
    location: nullableLocationSchema.optional(),
    date: dateSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
