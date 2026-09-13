import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { SubscriptionController } from './subscription.controller';
import { validate } from '../../middlewares/validate.middleware';
import {
  convertSubscriptionToRecurringTransactionSchema,
  convertSubscriptionToReminderSchema,
} from './subscription.validation';

const router = Router();
const controller = new SubscriptionController();

router.use(authMiddleware);

router.get('/discover', requirePermission(PERMISSIONS.SUBSCRIPTION_READ), controller.discover);
router.post(
  '/convert-to-reminder',
  requirePermission(PERMISSIONS.SUBSCRIPTION_MANAGE, PERMISSIONS.REMINDER_CREATE),
  validate(convertSubscriptionToReminderSchema),
  controller.convertToReminder,
);
router.post(
  '/convert-to-recurring-transaction',
  requirePermission(PERMISSIONS.SUBSCRIPTION_MANAGE, PERMISSIONS.RECURRING_TRANSACTION_CREATE),
  validate(convertSubscriptionToRecurringTransactionSchema),
  controller.convertToRecurringTransaction,
);

export default router;
