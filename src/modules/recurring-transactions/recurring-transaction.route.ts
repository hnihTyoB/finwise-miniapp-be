import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { RecurringTransactionController } from './recurring-transaction.controller';
import {
  createRecurringTransactionSchema,
  findRecurringTransactionsSchema,
  recurringTransactionHistorySchema,
  recurringTransactionParamsSchema,
  recurringTransactionPreviewSchema,
  updateRecurringTransactionSchema,
} from './recurring-transaction.validation';

const router = Router();
const controller = new RecurringTransactionController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);
router.get('/', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_READ), validate(findRecurringTransactionsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_CREATE), validate(createRecurringTransactionSchema), controller.create);
router.get('/:id/preview', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_READ), validate(recurringTransactionParamsSchema, 'params'), validate(recurringTransactionPreviewSchema, 'query'), controller.preview);
router.get('/:id/history', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_READ), validate(recurringTransactionParamsSchema, 'params'), validate(recurringTransactionHistorySchema, 'query'), controller.history);
router.post('/:id/pause', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_UPDATE), validate(recurringTransactionParamsSchema, 'params'), controller.pause);
router.post('/:id/resume', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_UPDATE), validate(recurringTransactionParamsSchema, 'params'), controller.resume);
router.get('/:id', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_READ), validate(recurringTransactionParamsSchema, 'params'), controller.findById);
router.patch('/:id', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_UPDATE), validate(recurringTransactionParamsSchema, 'params'), validate(updateRecurringTransactionSchema), controller.update);
router.delete('/:id', requirePermission(PERMISSIONS.RECURRING_TRANSACTION_DELETE), validate(recurringTransactionParamsSchema, 'params'), controller.remove);

export default router;
