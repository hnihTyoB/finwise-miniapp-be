import { z } from 'zod';
export { convertSubscriptionToRecurringTransactionSchema } from '../recurring-transactions/recurring-transaction.validation';

export const convertSubscriptionToReminderSchema = z.object({
  merchantName: z.string().min(1).max(100),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid positive number'),
  currency: z.string().min(3).max(10).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  remindAt: z.string().datetime(),
  remindDaysBefore: z.number().int().min(0).max(30).optional(),
  categoryId: z.string().uuid().optional(),
});

