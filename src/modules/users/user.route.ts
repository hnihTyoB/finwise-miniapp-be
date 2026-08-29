import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { UserController } from './user.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createUserSchema, findAllUserSchema, updateUserSchema, userParamsSchema } from './user.validation';

const router = Router();
const controller = new UserController();

// GET /users?email=...&fullName=...&roleName=...&isActive=...&sortBy=...&order=...&page=...&limit=...
router.get('/', authMiddleware, requirePermission(PERMISSIONS.USER_READ), validate(findAllUserSchema, 'query'), controller.findAll);
router.get('/admin/stats', authMiddleware, requirePermission(PERMISSIONS.USER_READ), controller.getAdminStats);
router.get('/:id', authMiddleware, requirePermission(PERMISSIONS.USER_READ), validate(userParamsSchema, 'params'), controller.findById);
router.post('/', authMiddleware, requirePermission(PERMISSIONS.USER_CREATE), validate(createUserSchema), controller.create);
router.put('/:id', authMiddleware, requirePermission(PERMISSIONS.USER_UPDATE), validate(userParamsSchema, 'params'), validate(updateUserSchema), controller.update);
router.delete('/:id', authMiddleware, requirePermission(PERMISSIONS.USER_DELETE), validate(userParamsSchema, 'params'), controller.softDelete);
router.post('/:id/restore', authMiddleware, requirePermission(PERMISSIONS.USER_RESTORE), validate(userParamsSchema, 'params'), controller.restore);

export default router;
