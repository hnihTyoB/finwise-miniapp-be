import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Tên vai trò phải có ít nhất 2 ký tự')
    .max(50, 'Tên vai trò tối đa 50 ký tự')
    .regex(/^[A-Z0-9_]+$/, 'Tên vai trò chỉ bao gồm chữ in hoa, chữ số và dấu gạch dưới (ví dụ: AUDITOR, SUPPORT_AGENT)'),
  description: z.string().max(255, 'Mô tả tối đa 255 ký tự').optional(),
  permissionIds: z.array(z.string().uuid('Định dạng permissionId không hợp lệ')).optional(),
});

export const updateRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Tên vai trò phải có ít nhất 2 ký tự')
    .max(50, 'Tên vai trò tối đa 50 ký tự')
    .regex(/^[A-Z0-9_]+$/, 'Tên vai trò chỉ bao gồm chữ in hoa, chữ số và dấu gạch dưới')
    .optional(),
  description: z.string().max(255, 'Mô tả tối đa 255 ký tự').optional(),
});

export const roleQuerySchema = z.object({
  name: z.string().optional(),
  isSystem: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const roleParamsSchema = z.object({
  id: z.string().uuid('Định dạng Role ID không hợp lệ'),
});

export const rolePermissionParamsSchema = z.object({
  id: z.string().uuid('Định dạng Role ID không hợp lệ'),
  permissionId: z.string().uuid('Định dạng Permission ID không hợp lệ'),
});

export const assignRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid('Định dạng Permission ID không hợp lệ')),
});

export const permissionQuerySchema = z.object({
  resource: z.string().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
});

export const auditLogQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const userRoleUpdateSchema = z.object({
  roleId: z.string().uuid('Định dạng Role ID không hợp lệ'),
});
