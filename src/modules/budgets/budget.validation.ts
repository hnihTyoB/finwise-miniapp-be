import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertBusinessDate } from '../../common/date-time/business-time';

const budgetTypeSchema = z.enum(['OVERALL', 'CATEGORY']);
const budgetPeriodSchema = z.enum(['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency must contain exactly 3 letters')
  .regex(/^[A-Za-z]{3}$/, 'Currency must contain only letters')
  .transform((value) => value.toUpperCase());
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
const alertThresholdSchema = z
  .union([z.string().trim(), z.number().finite().transform(String)])
  .refine(
    (value) => /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value),
    'Alert threshold must have at most 2 decimal places',
  )
  .refine((value) => {
    const threshold = new Prisma.Decimal(value);
    return threshold.greaterThan(0) && threshold.lessThanOrEqualTo(100);
  }, 'Alert threshold must be greater than 0 and less than or equal to 100');
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .transform((value, context) => {
    try { return assertBusinessDate(value); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });

export const budgetParamsSchema = z.object({
  id: z.string().uuid('Invalid budget id'),
});

export const findBudgetsSchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  type: budgetTypeSchema.optional(),
  period: budgetPeriodSchema.optional(),
  currency: currencySchema.optional(),
  categoryId: z.string().uuid('Invalid category id').optional(),
  activeAt: dateSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default('false'),
  sortBy: z
    .enum(['name', 'amount', 'startDate', 'endDate', 'createdAt', 'updatedAt'])
    .optional()
    .default('startDate'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    amount: amountSchema,
    currency: currencySchema.optional().default('VND'),
    type: budgetTypeSchema,
    period: budgetPeriodSchema,
    categoryId: z.string().uuid('Invalid category id').nullable().optional(),
    startDate: dateSchema,
    endDate: dateSchema.optional(),
    alertThreshold: alertThresholdSchema.optional().default('80'),
  })
  .superRefine((data, context) => {
    if (data.type === 'CATEGORY' && !data.categoryId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'categoryId is required for a category budget',
      });
    }

    if (data.type === 'OVERALL' && data.categoryId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'categoryId must be omitted for an overall budget',
      });
    }

    if (data.period === 'CUSTOM' && !data.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate is required for a custom budget',
      });
    }

    if (data.period !== 'CUSTOM' && data.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate is calculated automatically for recurring periods',
      });
    }

    if (data.endDate && data.endDate < data.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });

export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    type: budgetTypeSchema.optional(),
    period: budgetPeriodSchema.optional(),
    categoryId: z.string().uuid('Invalid category id').nullable().optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    alertThreshold: alertThresholdSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .superRefine((data, context) => {
    if (data.period && data.period !== 'CUSTOM' && data.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate is calculated automatically for recurring periods',
      });
    }

    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });
