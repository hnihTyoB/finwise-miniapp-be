import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { MailService } from '../../common/services/mail.service';
import { mailConfig } from '../../config/mail.config';
import { envConfig } from '../../config/env.config';
import { NotificationRepository } from './notification.repository';
import {
  formatZaloNotificationText,
  ZaloBotService,
} from '../../common/services/zalo-bot.service';

export class NotificationDeliveryService {
  private readonly repository = new NotificationRepository();
  private readonly mailService = new MailService();
  private readonly zaloBotService = new ZaloBotService();

  async processDue(now: Date): Promise<number> {
    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
    const deliveries = await this.repository.findDueDeliveries(now, staleBefore);

    if (deliveries.length === 0) return 0;

    const concurrency = envConfig.notifications.concurrency;
    const timeoutMs = envConfig.notifications.deliveryTimeoutMs;
    const maxAttempts = envConfig.notifications.maxDeliveryAttempts;
    const baseDelayMs = envConfig.notifications.backoffBaseDelayMs;

    // Process deliveries in concurrency-limited batches
    for (let i = 0; i < deliveries.length; i += concurrency) {
      const batch = deliveries.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (delivery) => {
          const claimed = await this.repository.claimDelivery(
            delivery.id,
            now,
            staleBefore,
          );
          if (!claimed) return;

          try {
            // Enforce delivery timeout
            const skippedReason = await Promise.race([
              this.deliver(claimed),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Delivery timed out after ${timeoutMs}ms`)), timeoutMs),
              ),
            ]);

            await this.repository.completeDelivery(
              claimed.id,
              skippedReason
                ? NotificationDeliveryStatus.SKIPPED
                : NotificationDeliveryStatus.SENT,
              skippedReason ?? undefined,
            );
          } catch (error: any) {
            const attempt = claimed.attemptCount;
            if (attempt >= maxAttempts) {
              await this.repository.completeDelivery(
                claimed.id,
                NotificationDeliveryStatus.FAILED,
                `Max retry attempts (${maxAttempts}) reached. Error: ${error?.message || 'Unknown error'}`,
              );
            } else {
              const retryDelay = Math.min(
                2 ** attempt * baseDelayMs,
                24 * 60 * 60 * 1000, // max 24 hours
              );
              await this.repository.failDelivery(
                claimed.id,
                new Date(Date.now() + retryDelay),
                error?.message || 'Delivery attempt failed',
              );
            }
            console.error(`[NotificationWorker] Delivery ${claimed.id} failed (attempt ${attempt}/${maxAttempts}):`, error?.message);
          }
        }),
      );
    }

    return deliveries.length;
  }

  private async deliver(delivery: NonNullable<Awaited<ReturnType<NotificationRepository['claimDelivery']>>>): Promise<string | null> {
    if (delivery.channel === NotificationChannel.EMAIL) {
      if (!mailConfig.auth.user || !mailConfig.auth.pass) {
        return 'Email provider is not configured';
      }
      if (!delivery.notification.user.email) {
        return 'User has no email address';
      }
      await this.mailService.sendNotificationEmail(
        delivery.notification.user.email,
        delivery.notification,
        delivery.notification.user.fullName,
      );
      return null;
    }

    if (delivery.channel === NotificationChannel.ZALO) {
      if (!this.zaloBotService.isConfigured()) {
        return 'Zalo Bot token is not configured';
      }
      const chatId = delivery.notification.user.notificationSetting?.zaloBotChatId;
      if (!chatId) {
        return 'User has not linked their Zalo account to receive Bot notifications';
      }
      const text = formatZaloNotificationText(
        delivery.notification.title,
        delivery.notification.message,
        delivery.notification.actionUrl,
      );
      await this.zaloBotService.sendMessage(chatId, text);
      return null;
    }
    if (delivery.channel === NotificationChannel.PUSH) {
      return 'Push provider is not configured';
    }
    return 'In-app notifications do not require delivery jobs';
  }
}
