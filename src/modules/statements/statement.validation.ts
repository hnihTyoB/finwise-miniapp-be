import { z } from 'zod';

export const createStatementExportSchema = z.object({
  walletId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD'),
  format: z.enum(['XLSX', 'PDF', 'CSV']),
  password: z.string().min(4).max(32).optional(),
  passwordHint: z.string().max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.dateFrom >= data.dateTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dateFrom must be before dateTo',
      path: ['dateFrom'],
    });
  }
});

export const statementJobIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const statementVerifyParamSchema = z.object({
  code: z.string().min(1).max(64),
});

export const statementHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateStatementExportInput = z.infer<typeof createStatementExportSchema>;
export type StatementHistoryQuery = z.infer<typeof statementHistoryQuerySchema>;
