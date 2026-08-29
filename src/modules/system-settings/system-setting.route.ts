import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/permission.constant';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { systemSettingController } from './system-setting.controller';
import {
  systemSettingQuerySchema,
  updateMaintenanceModeSchema,
  updateSystemSettingSchema,
} from './system-setting.validation';

export const adminSettingsRouter = Router();

adminSettingsRouter.use(authMiddleware);

adminSettingsRouter.get(
  '/',
  requirePermission(PERMISSIONS.SYSTEM_CONFIG_READ),
  validate(systemSettingQuerySchema, 'query'),
  systemSettingController.findAll,
);

adminSettingsRouter.post(
  '/maintenance',
  requirePermission(PERMISSIONS.MAINTENANCE_MODE_UPDATE),
  validate(updateMaintenanceModeSchema),
  systemSettingController.updateMaintenanceMode,
);

adminSettingsRouter.get(
  '/:key',
  requirePermission(PERMISSIONS.SYSTEM_CONFIG_READ),
  systemSettingController.findByKey,
);

adminSettingsRouter.patch(
  '/:key',
  requirePermission(PERMISSIONS.SYSTEM_CONFIG_UPDATE),
  validate(updateSystemSettingSchema),
  systemSettingController.updateSetting,
);

export const publicSystemRouter = Router();

publicSystemRouter.get('/public-config', systemSettingController.getPublicConfig);
