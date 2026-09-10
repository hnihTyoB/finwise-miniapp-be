import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import {
  requireAnyPermission,
  requirePermission,
} from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from './notification.controller';
import {
  findNotificationsSchema,
  notificationParamsSchema,
  updateNotificationSettingSchema,
} from './notification.validation';

const router = Router();
const controller = new NotificationController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.NOTIFICATION_READ), validate(findNotificationsSchema, 'query'), controller.findAll);
router.get('/stream', requirePermission(PERMISSIONS.NOTIFICATION_READ), controller.stream);
router.get('/unread-count', requirePermission(PERMISSIONS.NOTIFICATION_READ), controller.unreadCount);
router.patch('/read-all', requirePermission(PERMISSIONS.NOTIFICATION_UPDATE), controller.markAllRead);
router.get('/settings', requirePermission(PERMISSIONS.NOTIFICATION_READ), controller.getSetting);
router.put(
  '/settings',
  requirePermission(PERMISSIONS.NOTIFICATION_UPDATE),
  validate(updateNotificationSettingSchema),
  controller.updateSetting,
);
router.patch(
  '/:id/read',
  requirePermission(PERMISSIONS.NOTIFICATION_UPDATE),
  validate(notificationParamsSchema, 'params'),
  controller.markRead,
);
router.delete(
  '/:id',
  requireAnyPermission(PERMISSIONS.NOTIFICATION_DELETE, PERMISSIONS.NOTIFICATION_UPDATE),
  validate(notificationParamsSchema, 'params'),
  controller.remove,
);

export default router;
