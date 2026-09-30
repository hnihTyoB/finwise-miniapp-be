import { Router } from 'express';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
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
  validate(previewAmortizationScheduleSchema),
  controller.preview,
);

router.get(
  '/',
  validate(findDebtsQuerySchema, 'query'),
  controller.findAll,
);

router.post(
  '/',
  validate(createDebtContractSchema),
  controller.create,
);

router.get(
  '/:id',
  validate(debtParamsSchema, 'params'),
  controller.findById,
);

router.put(
  '/:id',
  validate(debtParamsSchema, 'params'),
  validate(updateDebtContractSchema),
  controller.update,
);

router.delete(
  '/:id',
  validate(debtParamsSchema, 'params'),
  controller.archive,
);

router.post(
  '/:id/installments/:period/pay',
  validate(payInstallmentParamsSchema, 'params'),
  validate(payInstallmentSchema),
  controller.payInstallment,
);

router.post(
  '/:id/settle-early',
  validate(debtParamsSchema, 'params'),
  validate(earlySettlementSchema),
  controller.settleEarly,
);

export default router;

