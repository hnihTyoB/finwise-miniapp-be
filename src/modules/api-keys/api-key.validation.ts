import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants';

const VALID_PERMISSION_VALUES = new Set<string>(Object.values(PERMISSIONS));

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
  permissions: z
    .array(
      z
        .string()
        .min(1, 'Permission name cannot be empty')
        .refine((val) => VALID_PERMISSION_VALUES.has(val) || val === '*', {
          message: 'Invalid system permission name',
        }),
    )
    .optional(),
  ipWhitelist: z.array(z.string().min(1, 'IP cannot be empty')).optional(),
  expiresAt: z
    .string()
    .datetime()
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Expiration date must be in the future',
    })
    .nullable()
    .optional(),
});

export const apiKeyParamSchema = z.object({
  id: z.string().uuid('Invalid API key ID'),
});
