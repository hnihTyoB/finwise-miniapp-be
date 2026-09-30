import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { zaloBotController } from './zalo-bot.controller';
import { zaloWebhookAuthMiddleware } from '../../middlewares/zalo-webhook-auth.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

// Public Webhook endpoint từ Zalo Bot Platform (xác thực bằng X-Bot-Api-Secret-Token)
router.post('/webhook', zaloWebhookAuthMiddleware, zaloBotController.handleWebhook);

// Các endpoint nghiệp vụ cho người dùng (yêu cầu đăng nhập FinWise và quyền thông báo)
router.post(
  '/link-code',
  authMiddleware,
  requirePermission(PERMISSIONS.NOTIFICATION_UPDATE),
  zaloBotController.createLinkCode,
);
router.get(
  '/link-status',
  authMiddleware,
  requirePermission(PERMISSIONS.NOTIFICATION_READ),
  zaloBotController.getLinkStatus,
);
router.post(
  '/unlink',
  authMiddleware,
  requirePermission(PERMISSIONS.NOTIFICATION_UPDATE),
  zaloBotController.unlink,
);

export default router;
