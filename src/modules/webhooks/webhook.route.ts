import { Router } from 'express';
import { webhookController } from './webhook.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { PERMISSIONS } from '../../common/constants';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookParamSchema,
  webhookDeliveryParamSchema,
} from './webhook.validation';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission(PERMISSIONS.WEBHOOK_CREATE),
  validate(createWebhookSchema),
  webhookController.create,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.WEBHOOK_READ),
  webhookController.findAll,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.WEBHOOK_UPDATE),
  validate(webhookParamSchema, 'params'),
  validate(updateWebhookSchema),
  webhookController.update,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.WEBHOOK_DELETE),
  validate(webhookParamSchema, 'params'),
  webhookController.delete,
);

router.get(
  '/:id/deliveries',
  requirePermission(PERMISSIONS.WEBHOOK_READ),
  validate(webhookParamSchema, 'params'),
  webhookController.getDeliveries,
);

router.post(
  '/:id/test',
  requirePermission(PERMISSIONS.WEBHOOK_TEST),
  validate(webhookParamSchema, 'params'),
  webhookController.testPing,
);

router.post(
  '/:id/deliveries/:deliveryId/retry',
  requirePermission(PERMISSIONS.WEBHOOK_UPDATE),
  validate(webhookDeliveryParamSchema, 'params'),
  webhookController.retryDelivery,
);

export default router;
