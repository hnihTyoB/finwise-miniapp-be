import { cacheService } from '../../../common/services/cache.service';
import { LoggerService } from '../../../common/services/logger.service';
import { zaloBotCommandDispatcher } from './zalo-bot-command.dispatcher';
import {
  ZaloWebhookMessage,
  ZaloWebhookPayload,
  zaloWebhookPayloadSchema,
} from '../zalo-bot.validation';

export class ZaloBotWebhookService {
  private readonly logger = new LoggerService('ZaloBotWebhookService');

  /**
   * Xử lý payload webhook nhận được từ Zalo Bot Server.
   * Xử lý bất đồng bộ, không làm chậm response HTTP trả về cho Zalo.
   */
  async processWebhook(payload: unknown): Promise<void> {
    const parseResult = zaloWebhookPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      this.logger.warn('Invalid Zalo webhook payload structure', {
        errors: parseResult.error.issues,
      });
      return;
    }

    const data: ZaloWebhookPayload = parseResult.data;
    const rawResult = data.result || data;
    const eventName: string = rawResult.event_name || 'message.text.received';

    let rawMessage = rawResult.message;
    let message: ZaloWebhookMessage | undefined;

    if (typeof rawMessage === 'string') {
      try {
        message = JSON.parse(rawMessage);
      } catch {
        message = { text: rawMessage };
      }
    } else if (rawMessage && typeof rawMessage === 'object') {
      message = rawMessage as ZaloWebhookMessage;
    }

    if (!message) {
      this.logger.debug(`Zalo webhook event "${eventName}" without message ignored`);
      return;
    }

    const rawMsgId =
      message.message_id ??
      message.id ??
      (message as any).msg_id ??
      (rawResult as any).message_id ??
      (rawResult as any).msg_id;
    const messageId =
      rawMsgId !== undefined && rawMsgId !== null && String(rawMsgId).trim() !== ''
        ? String(rawMsgId)
        : undefined;

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

    const chatId = String(
      message.chat?.id || message.chat_id || message.from?.id || message.from_id || '',
    );
    const senderName = message.from?.display_name || message.from?.name || 'Người dùng';
    const text = message.text || message.caption || '';

    // Trích xuất message_id của tin nhắn mà user đang quote-reply (nếu có).
    // Hỗ trợ tất cả chuẩn: Zalo Bot Platform (reply_to_message), Zalo OA (quote_message_id), legacy (replied_to_message, quote)
    const rawReply =
      (message as any).reply_to_message ??
      message.replied_to_message ??
      (message as any).quote ??
      (message as any).quoted_message ??
      (rawResult as any).reply_to_message ??
      (rawResult as any).replied_to_message;

    let rawReplyId: unknown = undefined;
    if (rawReply && typeof rawReply === 'object') {
      rawReplyId =
        (rawReply as any).message_id ??
        (rawReply as any).id ??
        (rawReply as any).msg_id;
    } else if (typeof rawReply === 'string' || typeof rawReply === 'number') {
      rawReplyId = rawReply;
    }

    if (rawReplyId === undefined || rawReplyId === null || String(rawReplyId).trim() === '') {
      rawReplyId =
        (message as any).reply_to_message_id ??
        (message as any).reply_to_msg_id ??
        (message as any).quote_message_id ??
        (message as any).quote_msg_id ??
        (rawResult as any).reply_to_message_id ??
        (rawResult as any).quote_message_id;
    }

    const replyToMsgId: string | undefined =
      rawReplyId !== undefined && rawReplyId !== null && String(rawReplyId).trim() !== ''
        ? String(rawReplyId)
        : undefined;

    if (!chatId) {
      this.logger.warn('Could not extract chatId from message payload');
      return;
    }

    // Bảo mật: Không log raw message text của người dùng để tránh rò rỉ dữ liệu tài chính PII
    const maskedChatId = chatId.length > 4 ? `${chatId.slice(0, 4)}***` : chatId;
    this.logger.info(`Processing Zalo message event`, {
      eventName,
      messageId,
      chatId: maskedChatId,
      isQuoteReply: Boolean(replyToMsgId),
    });

    try {
      await zaloBotCommandDispatcher.dispatch({
        chatId,
        senderName,
        text,
        replyToMsgId,
        userMessageId: messageId,
      });
    } catch (err: unknown) {
      this.logger.error(`Error processing message from chat ${maskedChatId}:`, err);
    }
  }
}

export const zaloBotWebhookService = new ZaloBotWebhookService();
