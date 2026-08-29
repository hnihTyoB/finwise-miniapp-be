import { z } from 'zod';

export const parseQuerySchema = z.object({
  query: z.string().min(1, 'Query text is required').max(300),
});

export const executeQuerySchema = z.object({
  query: z.string().max(300).optional(),
  ast: z
    .object({
      rawQuery: z.string().optional().default(''),
      timeRange: z.object({
        type: z.enum([
          'TODAY',
          'THIS_WEEK',
          'LAST_WEEK',
          'THIS_MONTH',
          'LAST_MONTH',
          'THIS_YEAR',
          'LAST_7_DAYS',
          'LAST_30_DAYS',
          'CUSTOM',
        ]),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      transactionType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ALL']).default('EXPENSE'),
      categoryIds: z.array(z.string().uuid()).optional(),
      categoryNames: z.array(z.string()).optional(),
      walletIds: z.array(z.string().uuid()).optional(),
      walletNames: z.array(z.string()).optional(),
      amountFilter: z
        .object({
          minAmount: z.number().nonnegative().optional(),
          maxAmount: z.number().positive().optional(),
        })
        .optional(),
      aggregation: z.enum(['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX', 'LIST']).default('SUM'),
      groupBy: z.enum(['CATEGORY', 'WALLET', 'DAY', 'MONTH', 'NONE']).default('NONE'),
      limit: z.number().int().min(1).max(100).optional().default(30),
    })
    .optional(),
}).refine((data) => data.query || data.ast, {
  message: 'Either query string or ast must be provided',
});
