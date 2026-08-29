import { Router } from 'express';
import { jobController } from './job.controller';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createJobSchema, jobParamSchema } from './job.validation';
import { PERMISSIONS } from '../../common/constants';

const router = Router();

// Allows both User JWT Token and External System API Key
router.use(authOrApiKeyMiddleware);

router.post(
  '/',
  requirePermission(PERMISSIONS.JOB_CREATE),
  validate(createJobSchema),
  jobController.create,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.JOB_READ),
  jobController.findAll,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.JOB_READ),
  validate(jobParamSchema, 'params'),
  jobController.findById,
);

export default router;
