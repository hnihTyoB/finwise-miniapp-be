import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { UploadController } from './upload.controller';
import { createPresignedUploadSchema } from './upload.validation';

const router = Router();
const controller = new UploadController();

router.post(
  '/presign',
  authMiddleware,
  requirePermission(PERMISSIONS.UPLOAD_FILE),
  validate(createPresignedUploadSchema),
  controller.createPresignedUpload,
);

export default router;
