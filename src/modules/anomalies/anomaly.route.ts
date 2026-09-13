import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AnomalyController } from './anomaly.controller';
import { evaluateAnomalySchema } from './anomaly.validation';

const router = Router();
const controller = new AnomalyController();

router.use(authMiddleware);

router.post(
  '/evaluate',
  requirePermission(PERMISSIONS.ANOMALY_EVALUATE),
  validate(evaluateAnomalySchema),
  controller.evaluate,
);
router.get('/recent', requirePermission(PERMISSIONS.ANOMALY_READ), controller.getRecent);

export default router;
