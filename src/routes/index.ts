import { Router } from 'express';
import authRoute from '../modules/auth/auth.route';
import userRoute from '../modules/users/user.route';
import walletRoute from '../modules/wallets/wallet.route';
import categoryRoute from '../modules/categories/category.route';
import transactionRoute from '../modules/transactions/transaction.route';
import transferRoute from '../modules/transfers/transfer.route';
import budgetRoute from '../modules/budgets/budget.route';
import savingGoalRoute from '../modules/saving-goals/saving-goal.route';
import reportRoute from '../modules/reports/report.route';
import notificationRoute from '../modules/notifications/notification.route';
import reminderRoute from '../modules/reminders/reminder.route';
import aiAssistantRoute from '../modules/ai-assistant/ai-assistant.route';
import uploadRoute from '../modules/uploads/upload.route';
import forecastRoute from '../modules/forecast/forecast.route';
import simulationRoute from '../modules/simulations/simulation.route';
import anomalyRoute from '../modules/anomalies/anomaly.route';
import subscriptionRoute from '../modules/subscriptions/subscription.route';
import queryRoute from '../modules/query/query.route';
import recurringTransactionRoute from '../modules/recurring-transactions/recurring-transaction.route';
import { rolesRouter, permissionsRouter, auditLogsRouter } from '../modules/rbac/rbac.route';
import { adminSettingsRouter, publicSystemRouter } from '../modules/system-settings/system-setting.route';
import { adminNotificationsRouter } from '../modules/notifications/admin-notification.route';
import { adminAiRouter } from '../modules/ai-assistant/admin-ai.route';

import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { PERMISSIONS } from '../common/constants';
import { healthCheck, healthCheckDetail } from './health.controller';

import apiKeyRoute from '../modules/api-keys/api-key.route';
import webhookRoute from '../modules/webhooks/webhook.route';
import jobRoute from '../modules/jobs/job.route';

const router = Router();

// Public minimal health — for load balancer / uptime monitoring (no sensitive info)
router.get('/health', healthCheck);
// Detailed health — requires auth + SYSTEM_CONFIG_READ (admin only)
router.get('/health/detail', authMiddleware, requirePermission(PERMISSIONS.SYSTEM_CONFIG_READ), healthCheckDetail);

router.use('/system', publicSystemRouter);
router.use('/auth', authRoute);
router.use('/api-keys', apiKeyRoute);
router.use('/webhooks', webhookRoute);
router.use('/jobs', jobRoute);
router.use('/users', userRoute);
router.use('/roles', rolesRouter);
router.use('/permissions', permissionsRouter);
router.use('/audit-logs', auditLogsRouter);
router.use('/admin/settings', adminSettingsRouter);
router.use('/admin/notifications', adminNotificationsRouter);
router.use('/admin/ai', adminAiRouter);
router.use('/wallets', walletRoute);
router.use('/categories', categoryRoute);
router.use('/transactions', transactionRoute);
router.use('/transfers', transferRoute);
router.use('/budgets', budgetRoute);
router.use('/saving-goals', savingGoalRoute);
router.use('/reports', reportRoute);
router.use('/forecast', forecastRoute);
router.use('/simulations', simulationRoute);
router.use('/anomalies', anomalyRoute);
router.use('/subscriptions', subscriptionRoute);
router.use('/query', queryRoute);
router.use('/recurring-transactions', recurringTransactionRoute);
router.use('/notifications', notificationRoute);
router.use('/reminders', reminderRoute);
router.use('/ai-assistant', aiAssistantRoute);
router.use('/uploads', uploadRoute);

export default router;

