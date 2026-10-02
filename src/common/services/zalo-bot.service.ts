import { envConfig } from '../../config/env.config';

/**
 * Chuyển đổi các tiêu đề và nội dung thông báo hệ thống sang tiếng Việt nếu cần.
 */
function toVietnameseText(text: string): string {
  if (!text) return '';
  let result = text;

  // Title mappings
  result = result.replace(/^Budget exceeded:\s*/i, 'Cảnh báo vượt ngân sách: ');
  result = result.replace(/^Budget nearing limit:\s*/i, 'Ngân sách gần chạm hạn mức: ');
  result = result.replace(/^Saving goal achieved:\s*/i, 'Mục tiêu tiết kiệm hoàn thành: ');
  result = result.replace(/^Saving goal almost reached:\s*/i, 'Mục tiêu tiết kiệm sắp đạt: ');
  result = result.replace(/^Saving goal deadline approaching:\s*/i, 'Hạn mục tiêu tiết kiệm đang đến gần: ');
  result = result.replace(/^Unusual transaction detected/i, 'Phát hiện chi tiêu bất thường');
  result = result.replace(/^Recurring transaction paused/i, 'Giao dịch định kỳ bị tạm dừng');
  result = result.replace(/^Daily transaction reminder/i, 'Nhắc nhở ghi chép giao dịch hôm nay');

  // Message mappings
  result = result.replace(
    /^Spending has reached (\d+)% of this budget\./i,
    'Chi tiêu đã đạt $1% ngân sách này.',
  );
  result = result.replace(
    /^Congratulations! You have reached this saving goal\./i,
    'Chúc mừng bạn! Bạn đã hoàn thành mục tiêu tiết kiệm này.',
  );
  result = result.replace(
    /^You have completed (\d+)% of this saving goal\./i,
    'Bạn đã hoàn thành $1% mục tiêu tiết kiệm này.',
  );
  result = result.replace(
    /^The target date is\s*(\S+)\.?/i,
    'Hạn hoàn thành mục tiêu là ngày $1.',
  );
  result = result.replace(
    /^A recurring transaction could not be posted:\s*/i,
    'Không thể thực hiện giao dịch định kỳ: ',
  );
  result = result.replace(
    /^A scheduled reminder is due\./i,
    'Đã đến thời gian nhắc nhở theo lịch.',
  );
  result = result.replace(
    /^You haven't recorded any transactions today\. Take a few minutes to log your spending to keep your budget accurate!/i,
    'Hôm nay bạn chưa ghi nhận giao dịch nào. Hãy dành ít phút cập nhật chi tiêu để quản lý ngân sách chính xác nhé!',
  );

  return result;
}

/**
 * Định dạng text thông báo cho Zalo Bot theo Markdown của Zalo Bot Platform.
 * Đảm bảo thông báo bằng tiếng Việt và không chứa liên kết ngoại vi 'Mở trong FinWise'.
 * Tham khảo: https://bot.zapps.me/docs/apis/sendMessage/
 */
export function formatZaloNotificationText(
  title: string,
  message: string,
  _actionUrl?: string | null,
): string {
  const lines: string[] = [];

  const viTitle = toVietnameseText(title);
  const viMessage = toVietnameseText(message);

  const prefix = /^[\p{Emoji}\u2000-\u32ff]/u.test(viTitle) ? '' : '🔔 ';
  lines.push(`${prefix}**${viTitle}**`);
  lines.push('');
  lines.push(viMessage);

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
  async sendMessage(chatId: string, text: string): Promise<{ messageId?: string }> {
    const url = `${this.apiBase}/bot${this.token}/sendMessage`;

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: 'markdown',
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let data = (await response.json().catch(() => ({}))) as {
      ok: boolean;
      description?: string;
      result?: { message_id?: string | number; id?: string | number };
      message_id?: string | number;
    };

    // Nếu Zalo trả về lỗi do parse markdown không hợp lệ, thử gửi lại dưới dạng plain text
    if (!data.ok) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      data = (await response.json().catch(() => ({}))) as {
        ok: boolean;
        description?: string;
        result?: { message_id?: string | number; id?: string | number };
        message_id?: string | number;
      };
    }

    if (!data.ok) {
      throw new Error(
        `Zalo Bot sendMessage failed: ${data.description ?? 'unknown error'}`,
      );
    }

    const rawId = data.result?.message_id ?? data.result?.id ?? data.message_id;
    return { messageId: rawId ? String(rawId) : undefined };
  }

  /**
   * Lấy thông tin cơ bản về bot (account_name, display_name, id)
   */
  async getMe(): Promise<{ ok: boolean; result?: { id: string; account_name: string; display_name?: string } }> {
    const url = `${this.apiBase}/bot${this.token}/getMe`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response.json() as Promise<{ ok: boolean; result?: { id: string; account_name: string; display_name?: string } }>;
  }

  /**
   * Thiết lập Webhook URL với Zalo Bot Platform.
   * @param url          - URL HTTPS nhận webhook
   * @param secretToken  - Chuỗi bí mật gửi kèm trong header X-Bot-Api-Secret-Token
   */
  async setWebhook(url: string, secretToken: string): Promise<any> {
    const endpoint = `${this.apiBase}/bot${this.token}/setWebhook`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: secretToken }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response.json();
  }

  /**
   * Xóa cấu hình Webhook URL.
   */
  async deleteWebhook(): Promise<any> {
    const endpoint = `${this.apiBase}/bot${this.token}/deleteWebhook`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response.json();
  }

  /**
   * Lấy thông tin cấu hình Webhook hiện tại.
   */
  async getWebhookInfo(): Promise<any> {
    const endpoint = `${this.apiBase}/bot${this.token}/getWebhookInfo`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response.json();
  }
}

/** Singleton dùng chung — khởi tạo một lần, token đọc từ env khi server start. */
export const zaloBotService = new ZaloBotService();
