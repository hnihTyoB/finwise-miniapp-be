import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { CategoryController } from './category.controller';
import {
  categoryParamsSchema,
  categoryTreeSchema,
  createCategorySchema,
  findCategoriesSchema,
  updateCategorySchema,
} from './category.validation';

const router = Router();
const controller = new CategoryController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

router.get('/', requirePermission(PERMISSIONS.CATEGORY_READ), validate(findCategoriesSchema, 'query'), controller.findAll);
router.get('/tree', requirePermission(PERMISSIONS.CATEGORY_READ), validate(categoryTreeSchema, 'query'), controller.findTree);
router.post('/', requirePermission(PERMISSIONS.CATEGORY_CREATE), validate(createCategorySchema), controller.create);
router.get('/:id', requirePermission(PERMISSIONS.CATEGORY_READ), validate(categoryParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.CATEGORY_UPDATE),
  validate(categoryParamsSchema, 'params'),
  validate(updateCategorySchema),
  controller.update,
);
router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.CATEGORY_UPDATE),
  validate(categoryParamsSchema, 'params'),
  controller.restore,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CATEGORY_DELETE),
  validate(categoryParamsSchema, 'params'),
  controller.archive,
);

export default router;

