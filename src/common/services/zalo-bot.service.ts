import { envConfig } from '../../config/env.config';

/**
 * Định dạng text thông báo cho Zalo Bot theo Markdown của Zalo Bot Platform.
 * Tham khảo: https://bot.zapps.me/docs/apis/sendMessage/
 */
export function formatZaloNotificationText(
  title: string,
  message: string,
  actionUrl?: string | null,
): string {
  const lines: string[] = [];

  lines.push(`🔔 **${title}**`);
  lines.push('');
  lines.push(message);

  if (actionUrl) {
    lines.push('');
    lines.push(`> Xem chi tiết tại FinWise: ${actionUrl}`);
  }

  return lines.join('\n');
}

/**
 * Service gọi Zalo Bot API để gửi tin nhắn outbound.
 * Phase 1: chỉ gửi ra (one-way), không xử lý Webhook nhận về.
 *
 * Tài liệu API: https://bot.zapps.me/docs/apis/sendMessage/
 */
export class ZaloBotService {
  private readonly apiBase: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor() {
    this.token = envConfig.zaloBot.token;
    this.apiBase = envConfig.zaloBot.apiBaseUrl;
    this.timeoutMs = envConfig.zaloBot.requestTimeoutMs;
  }

  /**
   * Trả về true khi ZALO_BOT_TOKEN đã được cấu hình.
   */
  isConfigured(): boolean {
    return this.token.length > 0;
  }

  /**
   * Gửi tin nhắn văn bản có định dạng Markdown đến chat_id của người dùng.
   *
   * @param chatId  - chat.id lấy từ Zalo Bot event (user nhắn tin → bot nhận chat.id)
   * @param text    - Nội dung tin nhắn, hỗ trợ Zalo Markdown syntax
   * @throws        Error nếu API trả về ok=false hoặc HTTP lỗi
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    const url = `${this.apiBase}/bot${this.token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'markdown',
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Zalo Bot API HTTP ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      throw new Error(
        `Zalo Bot sendMessage failed: ${data.description ?? 'unknown error'}`,
      );
    }
  }
}

/** Singleton dùng chung — khởi tạo một lần, token đọc từ env khi server start. */
export const zaloBotService = new ZaloBotService();
