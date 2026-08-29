import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { WalletController } from './wallet.controller';
import {
  createWalletSchema,
  findWalletsSchema,
  updateWalletSchema,
  walletParamsSchema,
} from './wallet.validation';

const router = Router();
const controller = new WalletController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

router.get('/', requirePermission(PERMISSIONS.WALLET_READ), validate(findWalletsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.WALLET_CREATE), validate(createWalletSchema), controller.create);
router.get('/:id', requirePermission(PERMISSIONS.WALLET_READ), validate(walletParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  validate(updateWalletSchema),
  controller.update,
);
router.patch(
  '/:id/default',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  controller.setDefault,
);
router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  controller.restore,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.WALLET_DELETE),
  validate(walletParamsSchema, 'params'),
  controller.archive,
);

export default router;
