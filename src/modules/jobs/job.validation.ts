import { z } from 'zod';

export const ALLOWED_JOB_TYPES = [
  'REPORT_EXPORT',
  'AI_DEEP_ANALYSIS',
  'BULK_IMPORT',
  'DATA_CLEANUP',
] as const;

export const createJobSchema = z.object({
  type: z.enum(ALLOWED_JOB_TYPES, {
    errorMap: () => ({ message: 'Loại tác vụ không hợp lệ hoặc chưa được hỗ trợ' }),
  }),
  input: z.record(z.any()).optional(),
});

export const jobParamSchema = z.object({
  id: z.string().uuid('Invalid Job ID'),
});
