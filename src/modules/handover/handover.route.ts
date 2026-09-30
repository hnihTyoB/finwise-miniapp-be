import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { HandoverController } from './handover.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  cancelHandoverSchema,
  claimHandoverSchema,
  confirmHandoverSchema,
  handoverResultParamsSchema,
} from './handover.validation';

const router = Router();
const controller = new HandoverController();

router.use(authMiddleware);

// Bước 1: Máy A tạo phiên chuyển giao
router.post(
  '/initiate',
  requirePermission(PERMISSIONS.HANDOVER_INITIATE),
  controller.initiate,
);

// Máy A truy vấn trạng thái phiên
router.get(
  '/status',
  requirePermission(PERMISSIONS.HANDOVER_INITIATE),
  controller.getStatus,
);

// Bước 2: Máy B quét QR hoặc nhập PIN 6 số để kết nối
router.post(
  '/claim',
  requirePermission(PERMISSIONS.HANDOVER_CLAIM),
  validate(claimHandoverSchema),
  controller.claim,
);

// Bước 3: Máy A xác nhận mã OTP và thực hiện chuyển giao quyền sở hữu nguyên tử
router.post(
  '/confirm',
  requirePermission(PERMISSIONS.HANDOVER_INITIATE),
  validate(confirmHandoverSchema),
  controller.confirm,
);

// Bước 4: Máy B lấy kết quả chuyển giao
router.get(
  '/result/:handoverToken',
  requirePermission(PERMISSIONS.HANDOVER_CLAIM),
  validate(handoverResultParamsSchema, 'params'),
  controller.getResult,
);

// Hủy phiên chuyển giao
router.post(
  '/cancel',
  requirePermission(PERMISSIONS.HANDOVER_INITIATE),
  validate(cancelHandoverSchema),
  controller.cancel,
);

export default router;
