import { cacheService } from '../../../common/services/cache.service';
import { LoggerService } from '../../../common/services/logger.service';
import { BotConversationContext } from './zalo-bot-fast-entry.dto';

/**
 * Thời gian lưu trữ context hội thoại ngắn hạn (15 phút).
 * Trong thời gian này, reply không cần quote sẽ vẫn nhận diện được giao dịch vừa tạo.
 */
const CONTEXT_TTL_SECONDS = 900; // 15 phút

/**
 * Thời gian lưu ánh xạ message_id Bot → transactionId (24 giờ).
 * Người dùng có thể quote-reply bất cứ lúc nào trong ngày.
 */
const MSG_TO_TX_TTL_SECONDS = 86_400; // 24 giờ

/**
 * Service quản lý trạng thái hội thoại theo chatId trong Redis/in-memory cache.
 * Hỗ trợ 2 kiểu tra cứu:
 *   1. `zalo:ctx:{chatId}`          — Context ngắn hạn 15 phút (reply liền tay)
 *   2. `zalo:msg_tx:{botMsgId}`     — Ánh xạ tin nhắn Bot → TX để Quote-Reply bất kỳ lúc nào
 */
export class ZaloBotContextService {
  private readonly logger = new LoggerService('ZaloBotContextService');

  // ── Ghi context sau khi tạo giao dịch thành công ─────────────────────────

  /**
   * Lưu context hội thoại ngắn hạn sau khi giao dịch được tạo.
   */
  async saveContext(chatId: string, ctx: BotConversationContext): Promise<void> {
    const key = this.ctxKey(chatId);
    await cacheService.set(key, ctx, CONTEXT_TTL_SECONDS);
    this.logger.debug(`Saved context for chat ${chatId}: txId=${ctx.lastTransactionId}`);
  }

  /**
   * Lưu ánh xạ tin nhắn Bot → Transaction (24 giờ) để hỗ trợ Quote-Reply.
   */
  async saveMsgToTx(
    botMessageId: string,
    transactionId: string,
    userId: string,
  ): Promise<void> {
    const key = this.msgTxKey(botMessageId);
    await cacheService.set(key, { transactionId, userId }, MSG_TO_TX_TTL_SECONDS);
  }

  // ── Đọc context ──────────────────────────────────────────────────────────

  /**
   * Lấy context hội thoại ngắn hạn theo chatId (15 phút).
   */
  async getContext(chatId: string): Promise<BotConversationContext | null> {
    return cacheService.get<BotConversationContext>(this.ctxKey(chatId));
  }

  /**
   * Lấy transactionId từ ID tin nhắn Bot đã gửi (Quote-Reply 24 giờ).
   */
  async getTxFromMsg(botMessageId: string): Promise<{ transactionId: string; userId: string } | null> {
    return cacheService.get<{ transactionId: string; userId: string }>(this.msgTxKey(botMessageId));
  }

  // ── Xóa context sau hoàn tác ─────────────────────────────────────────────

  /**
   * Xóa context hội thoại ngắn hạn (sau khi undo để không undo 2 lần).
   */
  async clearContext(chatId: string): Promise<void> {
    await cacheService.del(this.ctxKey(chatId));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private ctxKey(chatId: string): string {
    return `zalo:ctx:${chatId}`;
  }

  private msgTxKey(botMsgId: string): string {
    return `zalo:msg_tx:${botMsgId}`;
  }
}

export const zaloBotContextService = new ZaloBotContextService();
