import { Router } from 'express';
import { ApiKeyController } from './api-key.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createApiKeySchema, apiKeyParamSchema } from './api-key.validation';
import { PERMISSIONS } from '../../common/constants';

const router = Router();
const controller = new ApiKeyController();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission(PERMISSIONS.API_KEY_CREATE),
  validate(createApiKeySchema),
  controller.create,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.API_KEY_READ),
  controller.findAll,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.API_KEY_DELETE),
  validate(apiKeyParamSchema, 'params'),
  controller.revoke,
);

export default router;
