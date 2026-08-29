import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/permission.constant';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { adminNotificationController } from './admin-notification.controller';
import {
  adminDeliveryQuerySchema,
  adminTemplateQuerySchema,
  notificationOverviewQuerySchema,
  updateChannelConfigSchema,
  updateTemplateSchema,
} from './admin-notification.validation';

export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(authMiddleware);

adminNotificationsRouter.get(
  '/overview',
  requirePermission(PERMISSIONS.NOTIFICATION_ADMIN_READ),
  validate(notificationOverviewQuerySchema, 'query'),
  adminNotificationController.getOverviewStats,
);

adminNotificationsRouter.get(
  '/deliveries',
  requirePermission(PERMISSIONS.NOTIFICATION_ADMIN_READ),
  validate(adminDeliveryQuerySchema, 'query'),
  adminNotificationController.findDeliveries,
);

adminNotificationsRouter.post(
  '/deliveries/:id/retry',
  requirePermission(PERMISSIONS.NOTIFICATION_RETRY),
  adminNotificationController.retryDelivery,
);

adminNotificationsRouter.get(
  '/templates',
  requirePermission(PERMISSIONS.NOTIFICATION_TEMPLATE_READ),
  validate(adminTemplateQuerySchema, 'query'),
  adminNotificationController.findTemplates,
);

adminNotificationsRouter.put(
  '/templates/:id',
  requirePermission(PERMISSIONS.NOTIFICATION_TEMPLATE_UPDATE),
  validate(updateTemplateSchema),
  adminNotificationController.updateTemplate,
);

adminNotificationsRouter.get(
  '/channels',
  requirePermission(PERMISSIONS.NOTIFICATION_ADMIN_READ),
  adminNotificationController.getChannelConfig,
);

adminNotificationsRouter.put(
  '/channels',
  requirePermission(PERMISSIONS.NOTIFICATION_CONFIG_UPDATE),
  validate(updateChannelConfigSchema),
  adminNotificationController.updateChannelConfig,
);
