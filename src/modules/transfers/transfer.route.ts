import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { TransferController } from './transfer.controller';
import {
  createTransferSchema,
  findTransfersSchema,
  transferParamsSchema,
} from './transfer.validation';

const router = Router();
const controller = new TransferController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.TRANSFER_READ), validate(findTransfersSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.TRANSFER_CREATE), validate(createTransferSchema), controller.create);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.TRANSFER_DELETE),
  validate(transferParamsSchema, 'params'),
  controller.delete,
);

export default router;
