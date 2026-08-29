import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/permission.constant';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { adminAiController } from './admin-ai.controller';
import {
  aiRequestLogQuerySchema,
  aiUsageSummaryQuerySchema,
  toggleAiFeatureSchema,
  updateAiRateLimitSchema,
} from './admin-ai.validation';

export const adminAiRouter = Router();

adminAiRouter.use(authMiddleware);

adminAiRouter.get(
  '/status',
  requirePermission(PERMISSIONS.AI_ADMIN_READ),
  adminAiController.getFeatureStatuses,
);

adminAiRouter.post(
  '/features/:feature/toggle',
  requirePermission(PERMISSIONS.AI_CONFIG_UPDATE),
  validate(toggleAiFeatureSchema),
  adminAiController.toggleFeature,
);

adminAiRouter.get(
  '/usage',
  requirePermission(PERMISSIONS.AI_USAGE_READ),
  validate(aiUsageSummaryQuerySchema, 'query'),
  adminAiController.getUsageSummary,
);

adminAiRouter.get(
  '/logs',
  requirePermission(PERMISSIONS.AI_USAGE_READ),
  validate(aiRequestLogQuerySchema, 'query'),
  adminAiController.findLogs,
);

adminAiRouter.get(
  '/rate-limit',
  requirePermission(PERMISSIONS.AI_ADMIN_READ),
  adminAiController.getRateLimitConfig,
);

adminAiRouter.put(
  '/rate-limit',
  requirePermission(PERMISSIONS.AI_CONFIG_UPDATE),
  validate(updateAiRateLimitSchema),
  adminAiController.updateRateLimitConfig,
);
