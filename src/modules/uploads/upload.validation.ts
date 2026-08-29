import { z } from 'zod';
import { envConfig } from '../../config/env.config';
import { AVATAR_CONTENT_TYPES, UPLOAD_PURPOSES } from './upload.dto';

export const createPresignedUploadSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(AVATAR_CONTENT_TYPES),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(
      envConfig.r2.avatarMaxFileSizeBytes,
      `Avatar must not exceed ${envConfig.r2.avatarMaxFileSizeMb} MB`,
    ),
}).strict();
