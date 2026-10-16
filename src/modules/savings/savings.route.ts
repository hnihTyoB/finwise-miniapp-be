import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { PERMISSIONS } from '../../common/constants';
import { validate } from '../../middlewares/validate.middleware';
import { SavingsController } from './savings.controller';
import {
  createTermDepositSchema,
  previewEarlyWithdrawalQuerySchema,
  previewSavingsCalculationSchema,
  settleTermDepositSchema,
  termDepositParamsSchema,
  termDepositQuerySchema,
  updateTermDepositSchema,
} from './savings.validation';

const router = Router();
const controller = new SavingsController();

router.use(authMiddleware);

router.post(
  '/preview',
  requirePermission(PERMISSIONS.SAVINGS_READ),
  validate(previewSavingsCalculationSchema),
  controller.preview,
);
router.get(
  '/',
  requirePermission(PERMISSIONS.SAVINGS_READ),
  validate(termDepositQuerySchema, 'query'),
  controller.findAll,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.SAVINGS_CREATE),
  validate(createTermDepositSchema),
  controller.create,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SAVINGS_READ),
  validate(termDepositParamsSchema, 'params'),
  controller.findById,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.SAVINGS_UPDATE),
  validate(termDepositParamsSchema, 'params'),
  validate(updateTermDepositSchema),
  controller.update,
);
router.post(
  '/:id/settle',
  requirePermission(PERMISSIONS.SAVINGS_SETTLE),
  validate(termDepositParamsSchema, 'params'),
  validate(settleTermDepositSchema),
  controller.settle,
);
router.get(
  '/:id/preview-early-withdrawal',
  requirePermission(PERMISSIONS.SAVINGS_READ),
  validate(termDepositParamsSchema, 'params'),
  validate(previewEarlyWithdrawalQuerySchema, 'query'),
  controller.previewEarlyWithdrawal,
);

export default router;
