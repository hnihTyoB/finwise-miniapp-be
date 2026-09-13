import { Prisma } from '@prisma/client';
import { z } from 'zod';

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
  .trim()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || !isNaN(Date.parse(value)),
    'Date must be a valid YYYY-MM-DD format or ISO 8601 date-time',
  )
  .transform((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00+07:00`);
    }
    return new Date(value);
  });

export const transferParamsSchema = z.object({
  id: z.string().uuid('Invalid transfer id'),
});

export const findTransfersSchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    walletId: z.string().uuid('Invalid wallet id').optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sortBy: z
      .enum(['amount', 'transferredAt', 'createdAt'])
      .optional()
      .default('transferredAt'),
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
  );

export const createTransferSchema = z
  .object({
    sourceWalletId: z.string().uuid('Invalid source wallet id'),
    destinationWalletId: z.string().uuid('Invalid destination wallet id'),
    amount: amountSchema,
    note: z.string().trim().max(500).nullable().optional(),
    transferredAt: dateSchema,
  })
  .refine((data) => data.sourceWalletId !== data.destinationWalletId, {
    message: 'Source and destination wallets must be different',
    path: ['destinationWalletId'],
  });
