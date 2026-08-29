import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { TransactionController } from './transaction.controller';
import { receiptUploadMiddleware } from './transaction-upload.middleware';
import {
  createTransactionSchema,
  findTransactionsSchema,
  transactionParamsSchema,
  updateTransactionSchema,
} from './transaction.validation';

const router = Router();
const controller = new TransactionController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

router.get('/', requirePermission(PERMISSIONS.TRANSACTION_READ), validate(findTransactionsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.TRANSACTION_CREATE), validate(createTransactionSchema), controller.create);
router.get('/:id', requirePermission(PERMISSIONS.TRANSACTION_READ), validate(transactionParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.TRANSACTION_UPDATE),
  validate(transactionParamsSchema, 'params'),
  validate(updateTransactionSchema),
  controller.update,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.TRANSACTION_DELETE),
  validate(transactionParamsSchema, 'params'),
  controller.delete,
);
router.put(
  '/:id/receipt',
  requirePermission(PERMISSIONS.TRANSACTION_UPDATE, PERMISSIONS.UPLOAD_FILE),
  validate(transactionParamsSchema, 'params'),
  receiptUploadMiddleware,
  controller.uploadReceipt,
);
router.get(
  '/:id/receipt',
  requirePermission(PERMISSIONS.TRANSACTION_READ),
  validate(transactionParamsSchema, 'params'),
  controller.getReceipt,
);
router.delete(
  '/:id/receipt',
  requirePermission(PERMISSIONS.TRANSACTION_UPDATE),
  validate(transactionParamsSchema, 'params'),
  controller.deleteReceipt,
);

export default router;

