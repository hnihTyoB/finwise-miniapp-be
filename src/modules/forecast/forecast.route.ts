import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { ForecastController } from './forecast.controller';

const router = Router();
const controller = new ForecastController();

router.use(authMiddleware);
router.use(requirePermission(PERMISSIONS.FORECAST_READ));

router.get('/runway', controller.getRunway);
router.get('/budget-depletion', controller.getBudgetDepletion);

export default router;
