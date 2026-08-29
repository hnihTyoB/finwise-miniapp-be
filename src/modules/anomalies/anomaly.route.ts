import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { AnomalyController } from './anomaly.controller';

const router = Router();
const controller = new AnomalyController();

router.use(authMiddleware);

router.post('/evaluate', requirePermission(PERMISSIONS.ANOMALY_EVALUATE), controller.evaluate);
router.get('/recent', requirePermission(PERMISSIONS.ANOMALY_READ), controller.getRecent);

export default router;
