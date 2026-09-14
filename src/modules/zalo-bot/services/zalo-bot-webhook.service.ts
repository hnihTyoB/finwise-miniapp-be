import { cacheService } from '../../../common/services/cache.service';
import { LoggerService } from '../../../common/services/logger.service';
import { zaloBotCommandDispatcher } from './zalo-bot-command.dispatcher';
import { ZaloWebhookPayload } from '../zalo-bot.validation';

export class ZaloBotWebhookService {
  private readonly logger = new LoggerService('ZaloBotWebhookService');

  /**
   * Xử lý payload webhook nhận được từ Zalo Bot Server.
   * Xử lý bất đồng bộ, không làm chậm response HTTP trả về cho Zalo.
   */
  async processWebhook(payload: ZaloWebhookPayload): Promise<void> {
    const result = payload.result;
    if (!result) {
      this.logger.debug('Received empty result in Zalo webhook payload');
      return;
    }

    const eventName = result.event_name;
    const message = result.message;

    this.logger.info(`Received Zalo webhook event "${eventName}"`);

    // Chỉ xử lý các sự kiện tin nhắn text từ người dùng
    if (eventName === 'message.text.received' && message) {
      const messageId = message.message_id;
      if (messageId) {
        // Kiểm tra deduplication chống xử lý lặp
        const dedupKey = `zalo:dedup:${messageId}`;
        const isAlreadyProcessed = await cacheService.get<boolean>(dedupKey);
        if (isAlreadyProcessed) {
          this.logger.warn(`Skipping duplicate message "${messageId}"`);
          return;
        }
        await cacheService.set(dedupKey, true, 3600); // 1 giờ
      }

      const chatId = message.chat.id;
      const senderName = message.from.display_name || 'Người dùng';
      const text = message.text || '';

      try {
        await zaloBotCommandDispatcher.dispatch({
          chatId,
          senderName,
          text,
        });
      } catch (err: any) {
        this.logger.error(`Error processing message from chat ${chatId}:`, err);
      }
    }
  }
}

export const zaloBotWebhookService = new ZaloBotWebhookService();
