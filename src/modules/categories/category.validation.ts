import { z } from 'zod';

const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE']);
const sourceSchema = z.enum(['ALL', 'SYSTEM', 'USER']);
const nullableIconSchema = z.string().trim().min(1).max(100).nullable();
const nullableColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex color')
  .nullable();

const commonFilterSchema = {
  search: z.string().trim().min(1).max(100).optional(),
  type: transactionTypeSchema.optional(),
  source: sourceSchema.optional().default('ALL'),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default('false'),
};

export const categoryParamsSchema = z.object({
  id: z.string().uuid('Invalid category id'),
});

export const findCategoriesSchema = z.object({
  ...commonFilterSchema,
  parentId: z
    .union([z.string().uuid('Invalid parent category id'), z.literal('root')])
    .transform((value) => value === 'root' ? null : value)
    .optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const categoryTreeSchema = z.object(commonFilterSchema);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: transactionTypeSchema,
  parentId: z.string().uuid('Invalid parent category id').nullable().optional(),
  icon: nullableIconSchema.optional(),
  color: nullableColorSchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
    type: transactionTypeSchema.optional(),
    parentId: z.string().uuid('Invalid parent category id').nullable().optional(),
    icon: nullableIconSchema.optional(),
    color: nullableColorSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

