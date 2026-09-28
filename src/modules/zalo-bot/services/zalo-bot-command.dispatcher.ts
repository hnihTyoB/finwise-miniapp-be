import { zaloBotRepository } from '../zalo-bot.repository';
import { zaloBotService } from '../../../common/services/zalo-bot.service';
import { zaloBotLinkService } from './zalo-bot-link.service';
import { zaloBotFastEntryService } from './zalo-bot-fast-entry.service';
import { zaloBotContextService } from './zalo-bot-context.service';
import { LoggerService } from '../../../common/services/logger.service';

export class ZaloBotCommandDispatcher {
  private readonly logger = new LoggerService('ZaloBotCommandDispatcher');

  /**
   * Xử lý tin nhắn đến từ người dùng và điều phối lệnh phù hợp.
   *
   * @param payload.replyToMsgId - message_id của tin nhắn Bot mà user đang quote-reply (nếu có)
   */
  async dispatch(payload: {
    chatId: string;
    senderName: string;
    text: string;
    replyToMsgId?: string;
    userMessageId?: string;
  }): Promise<void> {
    const { chatId, senderName, text, replyToMsgId, userMessageId } = payload;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    this.logger.info(`Dispatching message from chat ${chatId}`, {
      hasReplyTo: Boolean(replyToMsgId),
      textLength: trimmed.length,
    });

    // 1. Kiểm tra nếu là lệnh liên kết: /link <code> hoặc trực tiếp mã FW-XXXX
    const linkMatch = trimmed.match(/^(\/link\s+)?(FW-?[A-Z0-9]{4,6})$/i);
    if (linkMatch) {
      const code = linkMatch[2].toUpperCase();
      await this.handleLinkCommand(chatId, senderName, code);
      return;
    }

    // 2. Lệnh /start hoặc /help
    if (lower === '/start' || lower === '/help' || lower === 'tro giup' || lower === 'help') {
      await this.handleHelpCommand(chatId, senderName);
      return;
    }

    // 3. Lệnh /status hoặc "so du" / "bao cao"
    if (lower === '/status' || lower === 'so du' || lower === 'báo cáo' || lower === 'bao cao') {
      await this.handleStatusCommand(chatId);
      return;
    }

    // 4. Lệnh /unlink
    if (lower === '/unlink' || lower === 'huy lien ket' || lower === 'hủy liên kết') {
      await this.handleUnlinkCommand(chatId);
      return;
    }

    // 5. Kiểm tra tài khoản đã liên kết chưa
    const linkedUser = await this.findLinkedUser(chatId);

    if (!linkedUser) {
      // Chưa liên kết → hướng dẫn
      await zaloBotService.sendMessage(
        chatId,
        `Chào **${senderName}**! 👋\n\n` +
        `Để nhận cảnh báo chi tiêu và ghi chép tức thì từ FinWise, bạn hãy mở **FinWise Mini App** → vào **Cài đặt thông báo** để lấy mã liên kết và gửi vào đây nhé!`,
      );
      return;
    }

    // 6. Tài khoản đã liên kết → Conversational Fast-Entry
    const { replyText, transactionId } = await zaloBotFastEntryService.handleMessage(
      chatId,
      linkedUser.userId,
      trimmed,
      replyToMsgId,
      userMessageId,
    );
    const sent = await zaloBotService.sendMessage(chatId, replyText);

    // Lưu ánh xạ message_id Bot vừa gửi → transactionId (24h) để người dùng có thể Quote-Reply chính xác
    if (sent?.messageId && transactionId) {
      await zaloBotContextService.saveMsgToTx(sent.messageId, transactionId, linkedUser.userId);
    }
  }

  // ─── Lệnh quản lý Bot ────────────────────────────────────────────────────────

  private async handleLinkCommand(chatId: string, senderName: string, code: string): Promise<void> {
    const result = await zaloBotLinkService.verifyAndConsumeLinkCode(code, chatId, senderName);

    if (!result.success) {
      const errorMsg =
        '❌ **Mã liên kết không hợp lệ hoặc đã hết hạn!**\n\n' +
        '👉 Hãy mở **FinWise Mini App** → vào **Cài đặt thông báo** → bấm **"Kết Nối Zalo Bot"** để lấy mã mới nhé.';
      await zaloBotService.sendMessage(chatId, errorMsg);
      return;
    }

    const successMsg =
      `🎉 **Liên kết FinWise thành công!**\n\n` +
      `Xin chào **${result.userName}**, tài khoản Zalo của bạn đã được liên kết với FinWise.\n\n` +
      `✅ Kênh thông báo Zalo đã được bật.\n` +
      `🔔 Bạn sẽ nhận cảnh báo vượt ngân sách, nhắc nhở định kỳ trực tiếp tại đây.\n\n` +
      `💡 **Ghi chép nhanh ngay trong chat này!**\n` +
      `Chỉ cần nhắn tin theo dạng:\n` +
      `• \`Cà phê sáng 35k ví tiền mặt\`\n` +
      `• \`Ăn trưa 50k\`\n` +
      `• \`Vừa nhận lương 20tr ví VCB\`\n\n` +
      `Gõ **/help** để xem đầy đủ hướng dẫn.`;

    await zaloBotService.sendMessage(chatId, successMsg);
  }

  private async handleStatusCommand(chatId: string): Promise<void> {
    const settings = await zaloBotRepository.findUsersWithWalletsByChatId(chatId);

    if (!settings || settings.length === 0) {
      await zaloBotService.sendMessage(
        chatId,
        '⚠️ **Tài khoản Zalo này chưa được liên kết với FinWise.**\n\n' +
        'Hãy mở FinWise Mini App → Cài đặt thông báo để lấy mã liên kết 1 chạm nhé!',
      );
      return;
    }

    const lines: string[] = ['📊 **TỔNG QUAN TÀI CHÍNH FINWISE**', ''];

    for (const item of settings) {
      const user = item.user;
      lines.push(`👤 **Tài khoản:** ${user.fullName || 'Người dùng'}`);

      if (!user.wallets || user.wallets.length === 0) {
        lines.push('  *(Chưa có ví tài chính)*');
      } else {
        const balancesByCurrency: Record<string, number> = {};
        for (const w of user.wallets) {
          const bal = Number(w.balance);
          balancesByCurrency[w.currency] = (balancesByCurrency[w.currency] ?? 0) + bal;
          lines.push(`  • ${w.name}: **${new Intl.NumberFormat('vi-VN').format(bal)} ${w.currency}**`);
        }
        const summaryParts = Object.entries(balancesByCurrency)
          .map(([curr, total]) => `${new Intl.NumberFormat('vi-VN').format(total)} ${curr}`)
          .join(', ');
        lines.push(`  👉 **Tổng cộng: ${summaryParts}**`);
      }
      lines.push('');
    }

    lines.push('💡 *Gõ /help để xem các lệnh khác.*');
    await zaloBotService.sendMessage(chatId, lines.join('\n'));
  }

  private async handleUnlinkCommand(chatId: string): Promise<void> {
    const settings = await zaloBotRepository.findUsersWithWalletsByChatId(chatId);

    if (!settings || settings.length === 0) {
      await zaloBotService.sendMessage(
        chatId,
        'ℹ️ Tài khoản Zalo này hiện chưa liên kết với bất kỳ tài khoản FinWise nào.',
      );
      return;
    }

    for (const s of settings) {
      await zaloBotLinkService.unlinkBot(s.user.id);
    }

    await zaloBotService.sendMessage(
      chatId,
      '✅ **Đã hủy liên kết Zalo Bot thành công!**\n\n' +
      'Bạn sẽ không còn nhận thông báo FinWise qua Zalo này nữa. Bạn có thể liên kết lại bất cứ lúc nào qua Mini App.',
    );
  }

  private async handleHelpCommand(chatId: string, senderName: string): Promise<void> {
    const linkedUser = await this.findLinkedUser(chatId);
    const isLinked = Boolean(linkedUser);
    const statusText = isLinked ? '✅ Đã liên kết FinWise' : '⚠️ Chưa liên kết';

    const text =
      `🤖 **FINWISE BOT - TRỢ LÝ TÀI CHÍNH CÁ NHÂN**\n\n` +
      `Xin chào **${senderName}**! Trạng thái: **${statusText}**\n\n` +
      `📌 **Ghi chép nhanh (Fast-Entry):**\n` +
      `Chỉ cần nhắn tin tự nhiên là bot tự ghi vào sổ kế toán cho bạn!\n` +
      `• \`Cà phê sáng 35k ví tiền mặt\`\n` +
      `• \`Ăn trưa 50k\` *(tự dùng ví mặc định)*\n` +
      `• \`Vừa nhận lương 20tr ví VCB\`\n` +
      `• \`Đổ xăng 200k ví MoMo\`\n\n` +
      `✏️ **Sửa / Hoàn tác (trong vòng 15 phút):**\n` +
      `• Gõ \`hoàn tác\` hoặc \`hủy\` để đảo ngược giao dịch vừa tạo\n` +
      `• Gõ \`sửa thành 40k\` để đổi số tiền\n` +
      `• Gõ \`đổi ví VCB\` để đổi ví thanh toán\n` +
      `• Quote-Reply (trượt để trả lời) tin nhắn xác nhận bất kỳ lúc nào trong ngày\n\n` +
      `📌 **Các lệnh khác:**\n` +
      `• **/status** : Xem tổng số dư các ví\n` +
      `• **/link <mã>** : Liên kết tài khoản FinWise (VD: /link FW-8492)\n` +
      `• **/unlink** : Hủy nhận thông báo trên Zalo này\n` +
      `• **/help** : Xem hướng dẫn sử dụng bot`;

    await zaloBotService.sendMessage(chatId, text);
  }

  // ─── Helper ──────────────────────────────────────────────────────────────────

  /**
   * Tìm userId FinWise tương ứng với chatId Zalo (kiểm tra liên kết).
   */
  private async findLinkedUser(chatId: string): Promise<{ userId: string } | null> {
    return zaloBotRepository.findLinkedUserByChatId(chatId);
  }
}

export const zaloBotCommandDispatcher = new ZaloBotCommandDispatcher();
