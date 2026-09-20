import { prisma } from '../../../database/prisma.client';
import { zaloBotService } from '../../../common/services/zalo-bot.service';
import { zaloBotLinkService } from './zalo-bot-link.service';
import { LoggerService } from '../../../common/services/logger.service';

export class ZaloBotCommandDispatcher {
  private readonly logger = new LoggerService('ZaloBotCommandDispatcher');

  /**
   * Xử lý tin nhắn đến từ người dùng và điều phối lệnh phù hợp.
   */
  async dispatch(payload: {
    chatId: string;
    senderName: string;
    text: string;
  }): Promise<void> {
    const { chatId, senderName, text } = payload;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    this.logger.info(`Dispatching message from "${senderName}" (${chatId}): "${trimmed}"`);

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

    // 5. Mặc định: Phản hồi thông tin trợ giúp tương ứng với trạng thái của tài khoản
    await this.handleDefaultMessage(chatId, senderName);
  }

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
      `🔔 Bạn sẽ nhận được các cảnh báo vượt ngân sách, nhắc nhở định kỳ trực tiếp tại đây.\n\n` +
      `Gõ **/status** để kiểm tra số dư ví hoặc **/help** để xem thêm hướng dẫn.`;

    await zaloBotService.sendMessage(chatId, successMsg);
  }

  private async handleStatusCommand(chatId: string): Promise<void> {
    const settings = await prisma.notificationSetting.findMany({
      where: { zaloBotChatId: chatId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            wallets: {
              where: { isArchived: false },
              select: { name: true, balance: true, currency: true },
            },
          },
        },
      },
    });

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
        let totalBalance = 0;
        for (const w of user.wallets) {
          const bal = Number(w.balance);
          totalBalance += bal;
          lines.push(`  • ${w.name}: **${bal.toLocaleString('vi-VN')} ${w.currency}**`);
        }
        lines.push(`  👉 **Tổng cộng: ${totalBalance.toLocaleString('vi-VN')} VND**`);
      }
      lines.push('');
    }

    lines.push('💡 *Gõ /help để xem các lệnh khác.*');
    await zaloBotService.sendMessage(chatId, lines.join('\n'));
  }

  private async handleUnlinkCommand(chatId: string): Promise<void> {
    const settings = await prisma.notificationSetting.findMany({
      where: { zaloBotChatId: chatId },
    });

    if (!settings || settings.length === 0) {
      await zaloBotService.sendMessage(
        chatId,
        'ℹ️ Tài khoản Zalo này hiện chưa liên kết với bất kỳ tài khoản FinWise nào.',
      );
      return;
    }

    for (const s of settings) {
      await zaloBotLinkService.unlinkBot(s.userId);
    }

    await zaloBotService.sendMessage(
      chatId,
      '✅ **Đã hủy liên kết Zalo Bot thành công!**\n\n' +
      'Bạn sẽ không còn nhận thông báo FinWise qua Zalo này nữa. Bạn có thể liên kết lại bất cứ lúc nào qua Mini App.',
    );
  }

  private async handleHelpCommand(chatId: string, senderName: string): Promise<void> {
    const count = await prisma.notificationSetting.count({
      where: { zaloBotChatId: chatId },
    });

    const isLinked = count > 0;
    const statusText = isLinked ? '✅ Đã liên kết FinWise' : '⚠️ Chưa liên kết';

    const text =
      `🤖 **FINWISE BOT - TRỢ LÝ THÔNG BÁO TÀI CHÍNH**\n\n` +
      `Xin chào **${senderName}**! Trạng thái: **${statusText}**\n\n` +
      `📌 **Các lệnh hỗ trợ:**\n` +
      `• **/status** : Báo cáo nhanh số dư các ví tài chính\n` +
      `• **/link <mã>** : Liên kết tài khoản FinWise bằng mã 1 chạm (VD: /link FW-8492)\n` +
      `• **/unlink** : Hủy nhận thông báo trên Zalo này\n` +
      `• **/help** : Xem hướng dẫn sử dụng bot\n\n` +
      `✨ *Giai đoạn tiếp theo (Phase 3) sẽ hỗ trợ Trợ lý AI và truy vấn chi tiêu thông minh ngay tại đây!*`;

    await zaloBotService.sendMessage(chatId, text);
  }

  private async handleDefaultMessage(chatId: string, senderName: string): Promise<void> {
    const count = await prisma.notificationSetting.count({
      where: { zaloBotChatId: chatId },
    });

    if (count === 0) {
      await zaloBotService.sendMessage(
        chatId,
        `Chào **${senderName}**! 👋\n\n` +
        `Để nhận cảnh báo chi tiêu và nhắc nhở từ FinWise, bạn hãy mở **FinWise Mini App** → vào **Cài đặt thông báo** để lấy mã liên kết và gửi vào đây nhé!`,
      );
    } else {
      await zaloBotService.sendMessage(
        chatId,
        `Chào **${senderName}**! FinWise Bot đã nhận được tin nhắn.\n\n` +
        `Hiện tại bot đang hỗ trợ gửi cảnh báo và các lệnh tra cứu nhanh:\n` +
        `• Gõ **/status** để xem tổng số dư\n` +
        `• Gõ **/help** để xem danh sách lệnh\n\n` +
        `*(Tính năng Trợ lý AI trò chuyện tự do sẽ sớm ra mắt trong bản nâng cấp Phase 3).*`,
      );
    }
  }
}

export const zaloBotCommandDispatcher = new ZaloBotCommandDispatcher();
