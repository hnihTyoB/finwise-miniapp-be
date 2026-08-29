import { z } from 'zod';
export { convertSubscriptionToRecurringTransactionSchema } from '../recurring-transactions/recurring-transaction.validation';

export const convertSubscriptionToReminderSchema = z.object({
  merchantName: z.string().min(1).max(100),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid positive number'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  remindAt: z.string().datetime(),
  categoryId: z.string().uuid().optional(),
});
