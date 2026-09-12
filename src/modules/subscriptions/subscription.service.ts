import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from '@prisma/client';
import {
  ConvertSubscriptionToReminderDto,
  DiscoveryReportDto,
} from './subscription.dto';
import { SubscriptionDiscoveryEngine } from './subscription-engine';
import { SubscriptionRepository } from './subscription.repository';
import { RecurringTransactionService } from '../recurring-transactions/recurring-transaction.service';
import { ConvertSubscriptionToRecurringTransactionDto } from '../recurring-transactions/recurring-transaction.dto';
import { NotificationService } from '../notifications/notification.service';

const SCAN_BATCH_SIZE = 50;
const SCAN_HISTORY_DAYS = 180;

export class SubscriptionService {
  private readonly repository = new SubscriptionRepository();
  private readonly recurringTransactionService = new RecurringTransactionService();
  private readonly notificationService = new NotificationService();

  async discoverSubscriptions(userId: string): Promise<DiscoveryReportDto> {
    const [transactions, existingReminders] = await Promise.all([
      this.repository.getHistoricalExpenseTransactions(userId, SCAN_HISTORY_DAYS),
      this.repository.getExistingReminderTitles(userId),
    ]);

    const items = SubscriptionDiscoveryEngine.discover(
      transactions,
      existingReminders,
    );

    return {
      totalDiscovered: items.length,
      items,
    };
  }

  async convertToReminder(
    userId: string,
    input: ConvertSubscriptionToReminderDto,
  ) {
    return this.repository.convertToReminder(userId, input);
  }

  convertToRecurringTransaction(
    userId: string,
    input: ConvertSubscriptionToRecurringTransactionDto,
  ) {
    return this.recurringTransactionService.convertSubscription(userId, input);
  }

  /**
   * Proactive background scan: iterates over all active users in cursor batches,
   * runs subscription discovery for each, and creates an IN_APP notification for
   * any high-confidence subscriptions that are not yet linked to a reminder.
   *
   * Uses dedupKey to prevent re-notifying the same merchant within a 24-hour window,
   * so this method is safe to call on every worker tick as long as
   * the caller gates it with `subscriptionScanIntervalMs`.
   */
  async scanAndNotifyNewDiscoveries(): Promise<{ usersScanned: number; notificationsSent: number }> {
    let cursor: string | undefined;
    let usersScanned = 0;
    let notificationsSent = 0;
    const scanDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, resets dedup daily

    do {
      const { userIds, nextCursor } = await this.repository.findActiveUserIdsBatch(
        SCAN_HISTORY_DAYS,
        cursor,
        SCAN_BATCH_SIZE,
      );

      for (const userId of userIds) {
        try {
          const report = await this.discoverSubscriptions(userId);
          usersScanned += 1;

          // Only notify for high-confidence, unlinked subscriptions
          const candidates = report.items.filter(
            (item) => item.confidenceScore >= 0.85 && !item.isLinkedToReminder,
          );

          for (const item of candidates) {
            const notification = await this.notificationService.create({
              userId,
              type: NotificationType.SYSTEM,
              priority: item.isPriceDrift
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL,
              title: item.isPriceDrift
                ? `Giá ${item.merchantName} đã thay đổi`
                : `Phát hiện gói cước định kỳ: ${item.merchantName}`,
              message: item.isPriceDrift
                ? `${item.merchantName} tăng giá ${item.priceDriftPercentage?.toFixed(1)}% so với trung bình. Muốn theo dõi không?`
                : `${item.merchantName} xuất hiện ${item.occurrenceCount} lần (${item.frequency.toLowerCase()}). Thêm vào danh sách theo dõi?`,
              actionUrl: '/subscriptions',
              sourceType: NotificationSourceType.SYSTEM,
              sourceId: null,
              data: {
                merchantName: item.merchantName,
                averageAmount: item.averageAmount,
                currency: item.currency,
                frequency: item.frequency,
                confidenceScore: item.confidenceScore,
                isPriceDrift: item.isPriceDrift,
              },
              // Daily dedup key — one notification per merchant per user per day
              dedupKey: `subscription:discovered:${userId}:${item.merchantName}:${item.currency}:${scanDate}`,
            });

            if (notification) {
              notificationsSent += 1;
            }
          }
        } catch (error) {
          // Per-user errors must not abort the whole scan
          console.error(`[SubscriptionService] scanAndNotify failed for user ${userId}:`, error);
        }
      }

      cursor = nextCursor;
    } while (cursor);

    return { usersScanned, notificationsSent };
  }
}
