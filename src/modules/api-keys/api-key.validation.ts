import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
  permissions: z.array(z.string()).optional(),
  ipWhitelist: z.array(z.string().min(1, 'IP cannot be empty')).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const apiKeyParamSchema = z.object({
  id: z.string().uuid('Invalid API key ID'),
});
