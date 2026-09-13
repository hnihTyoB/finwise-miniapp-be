import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { ForecastController } from './forecast.controller';
import { budgetDepletionQuerySchema, forecastQuerySchema } from './forecast.validation';

const router = Router();
const controller = new ForecastController();

router.use(authMiddleware);
router.use(requirePermission(PERMISSIONS.FORECAST_READ));

router.get('/runway', validate(forecastQuerySchema, 'query'), controller.getRunway);
router.get('/budget-depletion', validate(budgetDepletionQuerySchema, 'query'), controller.getBudgetDepletion);

export default router;
