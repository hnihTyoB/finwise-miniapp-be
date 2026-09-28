import { cacheService } from '../../../common/services/cache.service';
import { LoggerService } from '../../../common/services/logger.service';
import { zaloBotCommandDispatcher } from './zalo-bot-command.dispatcher';
import {
  ZaloWebhookMessage,
  ZaloWebhookPayload,
  zaloWebhookPayloadSchema,
} from '../zalo-bot.validation';

/**
 * Trích xuất message_id của tin nhắn được quote/reply từ webhook payload của Zalo Bot.
 * Hỗ trợ tất cả cấu trúc webhook:
 *   - Zalo Bot Platform (bot.zapps.me / bot.zaloplatforms.com): reply_to_message, reply_to, replyTo, quote, quote_message
 *   - Zalo OA API: quote_msg_id, quote_message_id
 *   - Nested containers: reply_to.message.id, quote.message.message_id, quote.message.id
 *   - CamelCase & SnakeCase variants
 *   - Root-level vs result-level vs message-level payload properties
 *   - Dynamic regex fallback
 */
export function extractReplyToMsgId(
  payload: unknown,
  rawMessage: unknown,
): string | undefined {
  if (!payload && !rawMessage) return undefined;

  const candidateContainers: Record<string, unknown>[] = [];

  const addContainer = (item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      candidateContainers.push(item as Record<string, unknown>);
    }
  };

  // 1. Message object (ưu tiên cao nhất)
  addContainer(rawMessage);

  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    // 2. Result/Data message (nếu có lồng)
    if (p.result && typeof p.result === 'object') {
      addContainer((p.result as Record<string, unknown>).message);
      addContainer(p.result);
    }
    if (p.data && typeof p.data === 'object') {
      addContainer((p.data as Record<string, unknown>).message);
      addContainer(p.data);
    }
    // 3. Payload root
    addContainer(p);
  }

  const directIdKeys = [
    'quote_msg_id',
    'quote_message_id',
    'quoteMsgId',
    'quoteMessageId',
    'quote_id',
    'quoteId',
    'quoted_msg_id',
    'quoted_message_id',
    'quotedMsgId',
    'quotedMessageId',
    'reply_to_msg_id',
    'reply_to_message_id',
    'replyToMsgId',
    'replyToMessageId',
    'reply_msg_id',
    'reply_message_id',
    'replyMsgId',
    'replyMessageId',
    'reply_to_id',
    'replyToId',
    'reply_id',
    'replyId',
    'parent_msg_id',
    'parent_message_id',
    'parentMsgId',
    'parentMessageId',
    'parent_id',
    'parentId',
    'ref_message_id',
    'ref_msg_id',
    'refMsgId',
    'source_message_id',
  ];

  const objectContainerKeys = [
    'reply_to',
    'replyTo',
    'reply_to_message',
    'replyToMessage',
    'replied_to_message',
    'repliedToMessage',
    'replied_message',
    'quote',
    'quoted',
    'quote_message',
    'quoteMessage',
    'quoted_message',
    'quotedMessage',
    'parent',
    'parent_message',
    'parentMessage',
  ];

  const innerIdKeys = [
    'message_id',
    'messageId',
    'msg_id',
    'msgId',
    'id',
    'quote_id',
    'quoteId',
    'quote_msg_id',
    'quote_message_id',
    'quoteMessageId',
    'reply_to_id',
    'replyToId',
    'item_id',
    'global_id',
  ];

  for (const container of candidateContainers) {
    // A. Kiểm tra direct ID field
    for (const key of directIdKeys) {
      const val = container[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }

    // B. Kiểm tra object container
    for (const key of objectContainerKeys) {
      const val = container[key];
      if (val === undefined || val === null) continue;

      // Nếu container là ID dạng chuỗi/số trực tiếp
      if (typeof val === 'string' || typeof val === 'number') {
        const strVal = String(val).trim();
        if (strVal !== '') return strVal;
      }

      // Nếu container là object
      if (typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;

        // Trích xuất ID trực tiếp từ obj
        for (const innerKey of innerIdKeys) {
          const innerVal = obj[innerKey];
          if (innerVal !== undefined && innerVal !== null && String(innerVal).trim() !== '') {
            return String(innerVal).trim();
          }
        }

        // Kiểm tra lồng thêm 1 cấp (vd: obj.message.message_id)
        if (obj.message && typeof obj.message === 'object' && !Array.isArray(obj.message)) {
          const subMsg = obj.message as Record<string, unknown>;
          for (const innerKey of innerIdKeys) {
            const innerVal = subMsg[innerKey];
            if (innerVal !== undefined && innerVal !== null && String(innerVal).trim() !== '') {
              return String(innerVal).trim();
            }
          }
        }
        if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
          const subData = obj.data as Record<string, unknown>;
          for (const innerKey of innerIdKeys) {
            const innerVal = subData[innerKey];
            if (innerVal !== undefined && innerVal !== null && String(innerVal).trim() !== '') {
              return String(innerVal).trim();
            }
          }
        }
      }
    }
  }

  // C. Fallback: Dynamic regex scan trên message và payload cho bất kỳ key nào có 'quote' hoặc 'reply' hoặc 'parent'
  const fallbackContainers = [rawMessage, payload];
  const quoteKeyRegex = /(?:quote|reply|parent)/i;

  for (const item of fallbackContainers) {
    if (!item || typeof item !== 'object') continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (!quoteKeyRegex.test(k)) continue;

      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (s !== '' && s.length <= 100 && !s.startsWith('http') && s !== 'true' && s !== 'false') {
          return s;
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const sub = v as Record<string, unknown>;
        for (const innerKey of innerIdKeys) {
          const innerVal = sub[innerKey];
          if (innerVal !== undefined && innerVal !== null && String(innerVal).trim() !== '') {
            return String(innerVal).trim();
          }
        }
      }
    }
  }

  return undefined;
}

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
    const eventName: string =
      rawResult.event_name ||
      (rawResult as Record<string, unknown>).eventName as string ||
      'message.text.received';

    const rawMessage = rawResult.message;
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
      message.msg_id ??
      message.messageId ??
      message.msgId ??
      data.result?.message_id ??
      data.result?.id ??
      data.result?.msg_id ??
      data.result?.messageId ??
      data.result?.msgId;
    const messageId =
      rawMsgId !== undefined && rawMsgId !== null && String(rawMsgId).trim() !== ''
        ? String(rawMsgId)
        : undefined;

    if (messageId) {
      // Kiểm tra deduplication chống xử lý lặp nguyên tử (Atomic SETNX)
      const dedupKey = `zalo:dedup:${messageId}`;
      const isNew = await cacheService.setIfNotExists(dedupKey, true, 3600); // 1 giờ
      if (!isNew) {
        this.logger.warn(`Skipping duplicate message "${messageId}"`);
        return;
      }
    }

    const chatId = String(
      message.chat?.id ||
      message.chat_id ||
      message.chatId ||
      message.from?.id ||
      message.from_id ||
      message.fromUser?.id ||
      (data as Record<string, unknown>)?.chat_id ||
      (data as Record<string, unknown>)?.chatId ||
      ((data as Record<string, unknown>)?.sender as Record<string, unknown>)?.id ||
      '',
    );
    const senderName =
      message.from?.display_name ||
      message.from?.name ||
      message.fromUser?.display_name ||
      message.fromUser?.name ||
      'Người dùng';
    const text = message.text || message.caption || '';

    // Trích xuất message_id của tin nhắn mà user đang quote-reply (nếu có).
    const replyToMsgId = extractReplyToMsgId(payload, message);

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
      replyToMsgId,
    });

    if (!replyToMsgId) {
      // Log INFO để debug trong production — không log giá trị PII, chỉ log tên keys
      const payloadKeys = payload && typeof payload === 'object' ? Object.keys(payload as object) : [];
      const messageKeys = rawMessage && typeof rawMessage === 'object' ? Object.keys(rawMessage as object) : [];
      const resultKeys = (payload as Record<string, unknown>)?.result && typeof (payload as Record<string, unknown>).result === 'object'
        ? Object.keys((payload as Record<string, unknown>).result as object)
        : [];
      this.logger.info('No quote-reply detected — payload structure for diagnosis', {
        messageId,
        payloadKeys,
        resultKeys,
        messageKeys,
      });
    }

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
