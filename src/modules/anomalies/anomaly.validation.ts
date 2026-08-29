import { z } from 'zod';

export const evaluateAnomalySchema = z.object({
  transactionId: z.string().uuid().optional(),
  walletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid positive number'),
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  occurredAt: z.preprocess(
    (val) => (typeof val === 'string' || val instanceof Date ? new Date(val) : undefined),
    z.date().optional(),
  ),
});
