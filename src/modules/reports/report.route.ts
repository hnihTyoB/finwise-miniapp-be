import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { ReportController } from './report.controller';
import { reportQuerySchema } from './report.validation';

const router = Router();
const controller = new ReportController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);
router.use(requirePermission(PERMISSIONS.REPORT_READ));

router.get('/overview', validate(reportQuerySchema, 'query'), controller.overview);
router.get('/cash-flow', validate(reportQuerySchema, 'query'), controller.cashFlow);
router.get(
  '/spending-by-category',
  validate(reportQuerySchema, 'query'),
  controller.spendingByCategory,
);
router.get(
  '/budget-performance',
  validate(reportQuerySchema, 'query'),
  controller.budgetPerformance,
);

export default router;
