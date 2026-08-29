import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { BudgetController } from './budget.controller';
import {
  budgetParamsSchema,
  createBudgetSchema,
  findBudgetsSchema,
  updateBudgetSchema,
} from './budget.validation';

const router = Router();
const controller = new BudgetController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.BUDGET_READ), validate(findBudgetsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.BUDGET_CREATE), validate(createBudgetSchema), controller.create);
router.get('/:id', requirePermission(PERMISSIONS.BUDGET_READ), validate(budgetParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.BUDGET_UPDATE),
  validate(budgetParamsSchema, 'params'),
  validate(updateBudgetSchema),
  controller.update,
);
router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.BUDGET_UPDATE),
  validate(budgetParamsSchema, 'params'),
  controller.restore,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.BUDGET_DELETE),
  validate(budgetParamsSchema, 'params'),
  controller.archive,
);

export default router;
