import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { ReminderController } from './reminder.controller';
import {
  createReminderSchema,
  findRemindersSchema,
  reminderParamsSchema,
  updateDailyTransactionReminderSchema,
  updateReminderSchema,
} from './reminder.validation';

const router = Router();
const controller = new ReminderController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.REMINDER_READ), validate(findRemindersSchema, 'query'), controller.findAll);
router.post('/', requirePermission(PERMISSIONS.REMINDER_CREATE), validate(createReminderSchema), controller.create);

// Daily-transaction reminder — must be defined before /:id to avoid pattern clash
router.get('/daily-transaction', requirePermission(PERMISSIONS.REMINDER_READ), controller.getDailyTransactionReminder);
router.put('/daily-transaction', requirePermission(PERMISSIONS.REMINDER_UPDATE), validate(updateDailyTransactionReminderSchema), controller.updateDailyTransactionReminder);

router.get('/:id', requirePermission(PERMISSIONS.REMINDER_READ), validate(reminderParamsSchema, 'params'), controller.findById);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.REMINDER_UPDATE),
  validate(reminderParamsSchema, 'params'),
  validate(updateReminderSchema),
  controller.update,
);
router.delete('/:id', requirePermission(PERMISSIONS.REMINDER_DELETE), validate(reminderParamsSchema, 'params'), controller.remove);

export default router;

