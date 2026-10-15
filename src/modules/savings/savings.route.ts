import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
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

router.post('/preview', validate(previewSavingsCalculationSchema), controller.preview);
router.get('/', validate(termDepositQuerySchema, 'query'), controller.findAll);
router.post('/', validate(createTermDepositSchema), controller.create);
router.get('/:id', validate(termDepositParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  validate(termDepositParamsSchema, 'params'),
  validate(updateTermDepositSchema),
  controller.update,
);
router.post(
  '/:id/settle',
  validate(termDepositParamsSchema, 'params'),
  validate(settleTermDepositSchema),
  controller.settle,
);
router.get(
  '/:id/preview-early-withdrawal',
  validate(termDepositParamsSchema, 'params'),
  validate(previewEarlyWithdrawalQuerySchema, 'query'),
  controller.previewEarlyWithdrawal,
);

export default router;
