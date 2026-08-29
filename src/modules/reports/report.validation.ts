import { z } from 'zod';

const dateSchema = z
  .string()
  .datetime({
    offset: true,
    message: 'Date must be a valid ISO 8601 date-time',
  })
  .transform((value) => new Date(value));

export const reportQuerySchema = z
  .object({
    period: z
      .enum(['DAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM'])
      .optional()
      .default('MONTH'),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    walletId: z.string().uuid('Invalid wallet id').optional(),
    currency: z
      .string()
      .trim()
      .length(3, 'Currency must contain exactly 3 letters')
      .regex(/^[A-Za-z]{3}$/, 'Currency must contain only letters')
      .transform((value) => value.toUpperCase())
      .optional(),
    granularity: z
      .enum(['AUTO', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'])
      .optional()
      .default('AUTO'),
  })
  .superRefine((data, context) => {
    if (data.period === 'CUSTOM') {
      if (!data.dateFrom) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateFrom'],
          message: 'dateFrom is required for a custom period',
        });
      }
      if (!data.dateTo) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateTo'],
          message: 'dateTo is required for a custom period',
        });
      }
    } else if (data.dateFrom || data.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['period'],
        message: 'dateFrom and dateTo are only accepted for a CUSTOM period',
      });
    }

    if (data.dateFrom && data.dateTo && data.dateFrom >= data.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'dateTo must be after dateFrom',
      });
    }
  });
