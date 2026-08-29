import { SettingCategory } from '@prisma/client';
import { z } from 'zod';

export const systemSettingQuerySchema = z.object({
  category: z.nativeEnum(SettingCategory).optional(),
  search: z.string().trim().max(100).optional(),
  isPublic: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
});

export const updateSystemSettingSchema = z.object({
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.unknown()),
  ]),
});

export const updateMaintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).optional(),
  startAt: z.string().trim().nullable().optional(),
  endAt: z.string().trim().nullable().optional(),
});
