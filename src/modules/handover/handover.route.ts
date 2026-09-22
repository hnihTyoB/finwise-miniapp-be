import { Router } from 'express';
import { HandoverController } from './handover.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
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
router.post('/initiate', controller.initiate);

// Máy A truy vấn trạng thái phiên
router.get('/status', controller.getStatus);

// Bước 2: Máy B quét QR hoặc nhập PIN 6 số để kết nối
router.post('/claim', validate(claimHandoverSchema), controller.claim);

// Bước 3: Máy A xác nhận mã OTP và thực hiện chuyển giao quyền sở hữu nguyên tử
router.post('/confirm', validate(confirmHandoverSchema), controller.confirm);

// Bước 4: Máy B lấy kết quả chuyển giao
router.get(
  '/result/:handoverToken',
  validate(handoverResultParamsSchema, 'params'),
  controller.getResult,
);

// Hủy phiên chuyển giao
router.post('/cancel', validate(cancelHandoverSchema), controller.cancel);

export default router;
