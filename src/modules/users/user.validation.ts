import { z } from 'zod';

export const findAllUserSchema = z.object({
  email: z.string().optional(),
  fullName: z.string().optional(),
  roleName: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),

  sortBy: z.enum(['createdAt', 'email', 'fullName']).optional(),
  order: z.enum(['asc', 'desc']).optional(),

  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  roleId: z.string().uuid('Invalid roleId format'),
  fullName: z.string().trim().min(1).max(100).optional(),
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  roleId: z.string().uuid('Invalid roleId format').optional(),
});

export const userParamsSchema = z.object({
  id: z.string().uuid('Invalid user id'),
});
