import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { StatementController } from './statement.controller';
import {
  createStatementExportSchema,
  statementJobIdParamSchema,
  statementVerifyParamSchema,
  statementHistoryQuerySchema,
} from './statement.validation';

const router = Router();
const controller = new StatementController();

// ── Public endpoint: verify statement authenticity via QR code ───────────────
router.get(
  '/verify/:code',
  validate(statementVerifyParamSchema, 'params'),
  controller.verifyStatement,
);

// ── Authenticated endpoints ───────────────────────────────────────────────────
router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

router.post(
  '/export',
  requirePermission(PERMISSIONS.STATEMENT_EXPORT),
  validate(createStatementExportSchema, 'body'),
  controller.initiateExport,
);

router.get(
  '/history',
  requirePermission(PERMISSIONS.STATEMENT_READ),
  validate(statementHistoryQuerySchema, 'query'),
  controller.listHistory,
);

router.get(
  '/jobs/:id',
  requirePermission(PERMISSIONS.STATEMENT_READ),
  validate(statementJobIdParamSchema, 'params'),
  controller.getJob,
);

router.get(
  '/jobs/:id/download',
  requirePermission(PERMISSIONS.STATEMENT_READ),
  validate(statementJobIdParamSchema, 'params'),
  controller.downloadStatement,
);

router.get(
  '/download/:id',
  requirePermission(PERMISSIONS.STATEMENT_READ),
  validate(statementJobIdParamSchema, 'params'),
  controller.downloadStatement,
);

export default router;
