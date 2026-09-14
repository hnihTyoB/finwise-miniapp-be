import { Router } from 'express';
import { zaloBotController } from './zalo-bot.controller';
import { zaloWebhookAuthMiddleware } from '../../middlewares/zalo-webhook-auth.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

// Public Webhook endpoint từ Zalo Bot Platform (xác thực bằng X-Bot-Api-Secret-Token)
router.post('/webhook', zaloWebhookAuthMiddleware, zaloBotController.handleWebhook);

// Các endpoint nghiệp vụ cho người dùng (yêu cầu đăng nhập FinWise)
router.post('/link-code', authMiddleware, zaloBotController.createLinkCode);
router.get('/link-status', authMiddleware, zaloBotController.getLinkStatus);
router.post('/unlink', authMiddleware, zaloBotController.unlink);

export default router;
