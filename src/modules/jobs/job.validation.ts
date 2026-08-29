import { z } from 'zod';

export const createJobSchema = z.object({
  type: z.string().min(1, 'Job type is required').max(100),
  input: z.record(z.any()).optional(),
});

export const jobParamSchema = z.object({
  id: z.string().uuid('Invalid Job ID'),
});
