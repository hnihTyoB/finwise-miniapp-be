import { z } from 'zod';

export const forecastQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .optional(),
  horizonDays: z
    .preprocess(
      (val) => (val === undefined || val === '' ? undefined : Number(val)),
      z.number().int().min(7).max(90).optional(),
    ),
});

export const budgetDepletionQuerySchema = z.object({
  currency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .optional(),
});
