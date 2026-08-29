import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { RbacController } from './rbac.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  createRoleSchema,
  updateRoleSchema,
  roleQuerySchema,
  roleParamsSchema,
  rolePermissionParamsSchema,
  assignRolePermissionsSchema,
  permissionQuerySchema,
  auditLogQuerySchema,
} from './rbac.validation';

const router = Router();
const controller = new RbacController();

// ==========================================
// ROLES ROUTES (/api/v1/roles)
// ==========================================
export const rolesRouter = Router();

rolesRouter.get(
  '/',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_READ),
  validate(roleQuerySchema, 'query'),
  controller.findAllRoles
);

rolesRouter.post(
  '/',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_CREATE),
  validate(createRoleSchema),
  controller.createRole
);

rolesRouter.get(
  '/:id',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_READ),
  validate(roleParamsSchema, 'params'),
  controller.findRoleById
);

rolesRouter.put(
  '/:id',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  validate(roleParamsSchema, 'params'),
  validate(updateRoleSchema),
  controller.updateRole
);

rolesRouter.delete(
  '/:id',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_DELETE),
  validate(roleParamsSchema, 'params'),
  controller.deleteRole
);

rolesRouter.get(
  '/:id/permissions',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_READ),
  validate(roleParamsSchema, 'params'),
  controller.getRolePermissions
);

rolesRouter.put(
  '/:id/permissions',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_PERMISSION_ASSIGN),
  validate(roleParamsSchema, 'params'),
  validate(assignRolePermissionsSchema),
  controller.assignRolePermissions
);

rolesRouter.post(
  '/:id/permissions',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_PERMISSION_ASSIGN),
  validate(roleParamsSchema, 'params'),
  validate(assignRolePermissionsSchema),
  controller.assignRolePermissions
);

rolesRouter.delete(
  '/:id/permissions/:permissionId',
  authMiddleware,
  requirePermission(PERMISSIONS.ROLE_PERMISSION_ASSIGN),
  validate(rolePermissionParamsSchema, 'params'),
  controller.removeRolePermission
);

// ==========================================
// PERMISSIONS ROUTES (/api/v1/permissions)
// ==========================================
export const permissionsRouter = Router();

permissionsRouter.get(
  '/',
  authMiddleware,
  requirePermission(PERMISSIONS.PERMISSION_READ),
  validate(permissionQuerySchema, 'query'),
  controller.findAllPermissions
);

// ==========================================
// AUDIT LOGS ROUTES (/api/v1/audit-logs)
// ==========================================
export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/',
  authMiddleware,
  requirePermission(PERMISSIONS.AUDIT_LOG_READ),
  validate(auditLogQuerySchema, 'query'),
  controller.findAllAuditLogs
);

export default router;
