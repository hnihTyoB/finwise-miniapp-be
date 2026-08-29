import { z } from 'zod';

const decimalSchema = z
  .string()
  .trim()
  .regex(
    /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Balance must be a decimal string with at most 16 integer digits and 2 decimal places',
  );

const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter code')
  .regex(/^[A-Za-z]{3}$/, 'Currency must contain letters only')
  .transform((value) => value.toUpperCase());

const nullableIconSchema = z.string().trim().min(1).max(100).nullable();
const nullableColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex color')
  .nullable();
const nullableDescriptionSchema = z.string().trim().max(500).nullable();

export const walletParamsSchema = z.object({
  id: z.string().uuid('Invalid wallet id'),
});

export const findWalletsSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default('false'),
  sortBy: z.enum(['name', 'balance', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createWalletSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  balance: decimalSchema.optional(),
  currency: currencySchema.optional(),
  icon: nullableIconSchema.optional(),
  color: nullableColorSchema.optional(),
  description: nullableDescriptionSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
    balance: decimalSchema.optional(),
    currency: currencySchema.optional(),
    icon: nullableIconSchema.optional(),
    color: nullableColorSchema.optional(),
    description: nullableDescriptionSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
