import { z } from 'zod';

const moneySchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Amount must be a positive decimal value');

const optionalDateSchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  z
    .string()
    .datetime({ offset: true, message: 'Date must be a valid ISO 8601 date-time' })
    .transform((value) => new Date(value))
    .optional(),
);

const optionalCurrencySchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  z
    .string()
    .trim()
    .length(3, 'Currency must contain exactly 3 letters')
    .regex(/^[A-Za-z]{3}$/, 'Currency must contain only letters')
    .transform((value) => value.toUpperCase())
    .optional(),
);

const analysisScopeShape = {
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  currency: optionalCurrencySchema,
};

function validateDateRange(
  data: { dateFrom?: Date; dateTo?: Date },
  context: z.RefinementCtx,
) {
  if ((data.dateFrom && !data.dateTo) || (!data.dateFrom && data.dateTo)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [data.dateFrom ? 'dateTo' : 'dateFrom'],
      message: 'dateFrom and dateTo must be provided together',
    });
  }
  if (data.dateFrom && data.dateTo && data.dateFrom >= data.dateTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateTo'],
      message: 'dateTo must be after dateFrom',
    });
  }
}

export const categorizeTransactionSchema = z.object({
  description: z.string().trim().min(2).max(500),
  amount: moneySchema.optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  merchant: z.string().trim().min(1).max(200).optional(),
  occurredAt: optionalDateSchema,
});

export const extractReceiptSchema = z.object({
  languageHint: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().trim().min(2).max(20).optional(),
  ),
  currencyHint: optionalCurrencySchema,
});

export const financialChatSchema = z
  .object({
    ...analysisScopeShape,
    question: z.string().trim().min(3).max(1000),
  })
  .superRefine(validateDateRange);

export const financialInsightsSchema = z
  .object({
    ...analysisScopeShape,
    focus: z
      .enum(['ALL', 'SPENDING', 'INCOME', 'CASH_FLOW'])
      .optional()
      .default('ALL'),
  })
  .superRefine(validateDateRange);

export const financialRecommendationsSchema = z
  .object({
    ...analysisScopeShape,
    priority: z
      .enum(['BALANCED', 'REDUCE_SPENDING', 'GROW_SAVINGS'])
      .optional()
      .default('BALANCED'),
  })
  .superRefine(validateDateRange);
