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
    const raw = payload as any;
    // Hỗ trợ cả 2 dạng: { ok: true, result: { event_name, message } } hoặc dạng phẳng { event_name, message }
    const rawResult = raw.result || raw;
    const eventName: string = rawResult.event_name || raw.event_name || 'message.text.received';
    let message = rawResult.message || raw.message;

    if (typeof message === 'string') {
      try {
        message = JSON.parse(message);
      } catch {
        message = { text: message };
      }
    }

    this.logger.info(`Received Zalo webhook event "${eventName}"`, raw);

    if (message) {
      const messageId = message.message_id || message.id;
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

      const chatId = String(message.chat?.id || message.chat_id || message.from?.id || message.from_id || '');
      const senderName = message.from?.display_name || message.from?.name || 'Người dùng';
      const text = message.text || message.caption || '';

      if (!chatId) {
        this.logger.warn('Could not extract chatId from message payload', message);
        return;
      }

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
