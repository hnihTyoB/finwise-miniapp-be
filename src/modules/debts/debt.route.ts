import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { DebtController } from './debt.controller';
import {
  createDebtContractSchema,
  debtParamsSchema,
  earlySettlementSchema,
  findDebtsQuerySchema,
  payInstallmentParamsSchema,
  payInstallmentSchema,
  previewAmortizationScheduleSchema,
  updateDebtContractSchema,
} from './debt.validation';

const router = Router();
const controller = new DebtController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

router.post(
  '/preview',
  requirePermission(PERMISSIONS.DEBT_READ),
  validate(previewAmortizationScheduleSchema),
  controller.preview,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.DEBT_READ),
  validate(findDebtsQuerySchema, 'query'),
  controller.findAll,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.DEBT_CREATE),
  validate(createDebtContractSchema),
  controller.create,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.DEBT_READ),
  validate(debtParamsSchema, 'params'),
  controller.findById,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.DEBT_UPDATE),
  validate(debtParamsSchema, 'params'),
  validate(updateDebtContractSchema),
  controller.update,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DEBT_DELETE),
  validate(debtParamsSchema, 'params'),
  controller.archive,
);

router.post(
  '/:id/installments/:period/pay',
  requirePermission(PERMISSIONS.DEBT_SETTLE),
  validate(payInstallmentParamsSchema, 'params'),
  validate(payInstallmentSchema),
  controller.payInstallment,
);

router.post(
  '/:id/settle-early',
  requirePermission(PERMISSIONS.DEBT_SETTLE),
  validate(debtParamsSchema, 'params'),
  validate(earlySettlementSchema),
  controller.settleEarly,
);

export default router;

