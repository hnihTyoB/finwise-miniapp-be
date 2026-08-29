import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { SavingGoalController } from './saving-goal.controller';
import {
  createSavingContributionSchema,
  createSavingGoalSchema,
  findSavingContributionsSchema,
  findSavingGoalsSchema,
  savingContributionParamsSchema,
  savingGoalParamsSchema,
  updateSavingContributionSchema,
  updateSavingGoalSchema,
} from './saving-goal.validation';

const router = Router();
const controller = new SavingGoalController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.SAVING_GOAL_READ), validate(findSavingGoalsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.SAVING_GOAL_CREATE), validate(createSavingGoalSchema), controller.create);
router.get(
  '/:id/contributions',
  requirePermission(PERMISSIONS.SAVING_GOAL_READ),
  validate(savingGoalParamsSchema, 'params'),
  validate(findSavingContributionsSchema, 'query'),
  controller.findContributions,
);
router.post(
  '/:id/contributions',
  requirePermission(PERMISSIONS.SAVING_GOAL_UPDATE),
  validate(savingGoalParamsSchema, 'params'),
  validate(createSavingContributionSchema),
  controller.createContribution,
);
router.put(
  '/:id/contributions/:contributionId',
  requirePermission(PERMISSIONS.SAVING_GOAL_UPDATE),
  validate(savingContributionParamsSchema, 'params'),
  validate(updateSavingContributionSchema),
  controller.updateContribution,
);
router.delete(
  '/:id/contributions/:contributionId',
  requirePermission(PERMISSIONS.SAVING_GOAL_UPDATE),
  validate(savingContributionParamsSchema, 'params'),
  controller.deleteContribution,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SAVING_GOAL_READ),
  validate(savingGoalParamsSchema, 'params'),
  controller.findById,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.SAVING_GOAL_UPDATE),
  validate(savingGoalParamsSchema, 'params'),
  validate(updateSavingGoalSchema),
  controller.update,
);
router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.SAVING_GOAL_UPDATE),
  validate(savingGoalParamsSchema, 'params'),
  controller.restore,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.SAVING_GOAL_DELETE),
  validate(savingGoalParamsSchema, 'params'),
  controller.archive,
);

export default router;
