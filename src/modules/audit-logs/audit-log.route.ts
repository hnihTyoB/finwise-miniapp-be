import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { PERMISSIONS } from '../../common/constants';
import { auditLogQuerySchema, archiveCleanupAuditLogSchema } from './audit-log.validation';
import { auditLogController } from './audit-log.controller';

export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/',
  authMiddleware,
  requirePermission(PERMISSIONS.AUDIT_LOG_READ),
  validate(auditLogQuerySchema, 'query'),
  auditLogController.findAllAuditLogs,
);

auditLogsRouter.post(
  '/archive-cleanup',
  authMiddleware,
  requirePermission(PERMISSIONS.AUDIT_LOG_READ),
  validate(archiveCleanupAuditLogSchema, 'body'),
  auditLogController.archiveAndCleanupAuditLogs,
);

export default auditLogsRouter;
