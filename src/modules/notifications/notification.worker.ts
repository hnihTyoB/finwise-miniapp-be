import { envConfig } from '../../config/env.config';
import { ReminderService } from '../reminders/reminder.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationService } from './notification.service';
import { RecurringTransactionService } from '../recurring-transactions/recurring-transaction.service';
import { BudgetService } from '../budgets/budget.service';
import { SubscriptionService } from '../subscriptions/subscription.service';

import { lockService } from '../../common/services/lock.service';
import { prisma } from '../../database/prisma.client';

export class NotificationWorker {
  private readonly reminderService = new ReminderService();
  private readonly notificationService = new NotificationService();
  private readonly deliveryService = new NotificationDeliveryService();
  private readonly recurringTransactionService = new RecurringTransactionService();
  private readonly budgetService = new BudgetService();
  private readonly subscriptionService = new SubscriptionService();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastFinancialScanAt = 0;
  private lastSubscriptionScanAt = 0;
  private lastTokenCleanupAt = 0;

  start() {
    if (!envConfig.notifications.workerEnabled || this.timer) {
      return;
    }
    this.timer = setInterval(
      () => void this.tick(),
      envConfig.notifications.workerIntervalMs,
    );
    this.timer.unref();
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    const lockKey = 'finwise:lock:notification-worker';
    const lockTtlMs = 5 * 60 * 1000; // 5 minutes max lock duration
    const lockToken = await lockService.acquire(lockKey, lockTtlMs);

    if (!lockToken) {
      return;
    }

    this.running = true;
    const now = new Date();

    try {
      try {
        await this.budgetService.processDueRenewals(now);
      } catch (error) {
        console.error('Notification worker failed to process budget renewals', error);
      }

      try {
        await this.recurringTransactionService.processDue(
          now,
          envConfig.recurringTransactions.batchLimit,
        );
      } catch (error) {
        console.error('Notification worker failed to process recurring transactions', error);
      }

      try {
        await this.reminderService.processDue(now);
      } catch (error) {
        console.error('Notification worker failed to process reminders', error);
      }

      try {
        await this.deliveryService.processDue(now);
      } catch (error) {
        console.error('Notification worker failed to process deliveries', error);
      }

      if (
        now.getTime() - this.lastFinancialScanAt
        >= envConfig.notifications.financialScanIntervalMs
      ) {
        try {
          await this.notificationService.scanFinancialAlerts(now);
          this.lastFinancialScanAt = now.getTime();
        } catch (error) {
          console.error('Notification worker failed to scan financial alerts', error);
        }
      }

      if (
        now.getTime() - this.lastSubscriptionScanAt
        >= envConfig.notifications.subscriptionScanIntervalMs
      ) {
        try {
          const result = await this.subscriptionService.scanAndNotifyNewDiscoveries();
          this.lastSubscriptionScanAt = now.getTime();
          if (result.notificationsSent > 0) {
            console.info(
              `[NotificationWorker] Subscription scan: ${result.usersScanned} users, ${result.notificationsSent} notifications sent`,
            );
          }
        } catch (error) {
          console.error('Notification worker failed to scan subscriptions', error);
        }
      }

      // Clean up expired tokens once every 24 hours (86_400_000 ms)
      if (now.getTime() - this.lastTokenCleanupAt >= 24 * 60 * 60 * 1000) {
        try {
          await Promise.all([
            prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
            prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
            prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
          ]);
          this.lastTokenCleanupAt = now.getTime();
        } catch (error) {
          console.error('Notification worker failed to clean up expired tokens', error);
        }
      }
    } finally {
      this.running = false;
      await lockService.release(lockKey, lockToken);
    }
  }
}

export const notificationWorker = new NotificationWorker();
