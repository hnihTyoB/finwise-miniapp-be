import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authOrApiKeyMiddleware } from '../../middlewares/api-key.middleware';
import { apiKeyRateLimitMiddleware } from '../../middlewares/api-key-rate-limit.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { WalletController } from './wallet.controller';
import { SharedWalletController } from './shared-wallet.controller';
import {
  createWalletSchema,
  findWalletsSchema,
  updateWalletSchema,
  walletParamsSchema,
} from './wallet.validation';
import {
  acceptInvitationSchema,
  cancelInvitationParamsSchema,
  createInvitationSchema,
  memberIdParamSchema,
  previewCodeParamSchema,
  sharedWalletAnalyticsQuerySchema,
  updateMemberSchema,
} from './shared-wallet.validation';

const router = Router();
const controller = new WalletController();
const sharedController = new SharedWalletController();

router.use(authOrApiKeyMiddleware);
router.use(apiKeyRateLimitMiddleware);

// Invitations (placed before /:id)
router.get(
  '/invitations/preview/:code',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(previewCodeParamSchema, 'params'),
  sharedController.previewInvitation,
);
router.post(
  '/invitations/accept',
  requirePermission(PERMISSIONS.WALLET_CREATE),
  validate(acceptInvitationSchema),
  sharedController.acceptInvitation,
);

// Standard wallet CRUD
router.get('/', requirePermission(PERMISSIONS.WALLET_READ), validate(findWalletsSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.WALLET_CREATE), validate(createWalletSchema), controller.create);
router.get('/:id', requirePermission(PERMISSIONS.WALLET_READ), validate(walletParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  validate(updateWalletSchema),
  controller.update,
);
router.patch(
  '/:id/default',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  controller.setDefault,
);
router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  controller.restore,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.WALLET_DELETE),
  validate(walletParamsSchema, 'params'),
  controller.archive,
);

// Shared wallet operations
router.post(
  '/:id/invitations',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(walletParamsSchema, 'params'),
  validate(createInvitationSchema),
  sharedController.createInvitation,
);
router.get(
  '/:id/invitations',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(walletParamsSchema, 'params'),
  sharedController.getInvitations,
);
router.delete(
  '/:id/invitations/:inviteId',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(cancelInvitationParamsSchema, 'params'),
  sharedController.cancelInvitation,
);
router.get(
  '/:id/members',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(walletParamsSchema, 'params'),
  sharedController.getMembers,
);
router.put(
  '/:id/members/:memberId',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(memberIdParamSchema, 'params'),
  validate(updateMemberSchema),
  sharedController.updateMember,
);
router.delete(
  '/:id/members/:memberId',
  requirePermission(PERMISSIONS.WALLET_UPDATE),
  validate(memberIdParamSchema, 'params'),
  sharedController.removeMember,
);
router.post(
  '/:id/leave',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(walletParamsSchema, 'params'),
  sharedController.leaveWallet,
);
router.post(
  '/:id/members/leave',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(walletParamsSchema, 'params'),
  sharedController.leaveWallet,
);
router.get(
  '/:id/analytics',
  requirePermission(PERMISSIONS.WALLET_READ),
  validate(walletParamsSchema, 'params'),
  validate(sharedWalletAnalyticsQuerySchema, 'query'),
  sharedController.getAnalytics,
);

export default router;
