import { z } from 'zod';

export const perturbationSchema = z.object({
  type: z.enum([
    'RECURRING_EXPENSE',
    'RECURRING_INCOME',
    'ONE_OFF_EXPENSE',
    'ONE_OFF_INCOME',
    'CATEGORY_ADJUSTMENT',
  ]),
  name: z.string().min(1).max(100),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid non-negative number')
    .optional(),
  percentageDelta: z.number().min(-100).max(500).optional(),
  categoryId: z.string().uuid().optional(),
  startMonth: z.number().int().min(1).max(36).optional(),
  durationMonths: z.number().int().min(1).max(36).optional(),
  targetMonth: z.number().int().min(1).max(36).optional(),
});

export const runSimulationSchema = z.object({
  currency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .optional(),
  horizonMonths: z.number().int().min(3).max(36).default(12),
  perturbations: z.array(perturbationSchema).min(1).max(20),
});
