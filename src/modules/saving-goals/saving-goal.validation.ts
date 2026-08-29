import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertBusinessDate, instantToBusinessDate } from '../../common/date-time/business-time';

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
    try { return assertBusinessDate(value); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });
const instantSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency must contain exactly 3 letters')
  .regex(/^[A-Za-z]{3}$/, 'Currency must contain only letters')
  .transform((value) => value.toUpperCase());
const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const savingGoalParamsSchema = z.object({
  id: z.string().uuid('Invalid saving goal id'),
});

export const savingContributionParamsSchema = z.object({
  id: z.string().uuid('Invalid saving goal id'),
  contributionId: z.string().uuid('Invalid saving contribution id'),
});

export const findSavingGoalsSchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
    dueFrom: dateSchema.optional(),
    dueTo: dateSchema.optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('false'),
    sortBy: z
      .enum(['name', 'targetAmount', 'targetDate', 'createdAt', 'updatedAt'])
      .optional()
      .default('targetDate'),
    order: z.enum(['asc', 'desc']).optional().default('asc'),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .refine(
    (data) => !data.dueFrom || !data.dueTo || data.dueTo >= data.dueFrom,
    { path: ['dueTo'], message: 'dueTo must be on or after dueFrom' },
  );

export const createSavingGoalSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    targetAmount: amountSchema,
    currency: currencySchema.optional().default('VND'),
    targetDate: dateSchema,
    description: nullableText(500),
    icon: nullableText(100),
    color: z
      .string()
      .trim()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        'Color must be a valid hex color',
      )
      .nullable()
      .optional(),
  })
  .refine((data) => data.targetDate >= instantToBusinessDate(new Date()), {
    path: ['targetDate'],
    message: 'targetDate must be in the future',
  });

export const updateSavingGoalSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
    targetAmount: amountSchema.optional(),
    currency: currencySchema.optional(),
    targetDate: dateSchema.optional(),
    description: nullableText(500),
    icon: nullableText(100),
    color: z
      .string()
      .trim()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        'Color must be a valid hex color',
      )
      .nullable()
      .optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .refine((data) => !data.targetDate || data.targetDate >= instantToBusinessDate(new Date()), {
    path: ['targetDate'],
    message: 'targetDate must be in the future',
  });

export const findSavingContributionsSchema = z
  .object({
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sortBy: z
      .enum(['amount', 'contributedAt', 'createdAt', 'updatedAt'])
      .optional()
      .default('contributedAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .refine(
    (data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom,
    { path: ['dateTo'], message: 'dateTo must be on or after dateFrom' },
  );

export const createSavingContributionSchema = z
  .object({
    amount: amountSchema,
    contributedAt: instantSchema.optional(),
    note: nullableText(500),
  })
  .transform((data) => ({
    ...data,
    contributedAt: data.contributedAt ?? new Date(),
  }))
  .refine((data) => data.contributedAt <= new Date(), {
    path: ['contributedAt'],
    message: 'contributedAt cannot be in the future',
  });

export const updateSavingContributionSchema = z
  .object({
    amount: amountSchema.optional(),
    contributedAt: instantSchema.optional(),
    note: nullableText(500),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .refine((data) => !data.contributedAt || data.contributedAt <= new Date(), {
    path: ['contributedAt'],
    message: 'contributedAt cannot be in the future',
  });
