import { zaloBotRepository } from '../zalo-bot.repository';
import { zaloBotService } from '../../../common/services/zalo-bot.service';
import { zaloBotLinkService } from './zalo-bot-link.service';
import { zaloBotFastEntryService } from './zalo-bot-fast-entry.service';
import { zaloBotContextService } from './zalo-bot-context.service';
import { LoggerService } from '../../../common/services/logger.service';
import { DebtSettlementService } from '../../debts/services/debt-settlement.service';
import { DebtRepository } from '../../debts/debt.repository';
import { prismaDateToBusinessDate } from '../../../common/date-time/business-time';

export class ZaloBotCommandDispatcher {
  private readonly logger = new LoggerService('ZaloBotCommandDispatcher');
  private readonly debtSettlementService = new DebtSettlementService();
  private readonly debtRepository = new DebtRepository();

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

    // 6. Lệnh quản lý Nợ: /no hoặc /debt hoặc "xem no"
    if (lower === '/no' || lower === '/debt' || lower === 'xem no' || lower === 'xem nợ') {
      await this.handleDebtListCommand(chatId, linkedUser.userId);
      return;
    }

    // 7. Lệnh thanh toán 1-chạm: /tra_no <id> hoặc /tra <id>
    const payMatch = trimmed.match(/^(\/tra_no|\/tra)\s+([a-f0-9-]{36})$/i);
    if (payMatch) {
      const scheduleItemId = payMatch[2];
      await this.handlePayDebtCommand(chatId, linkedUser.userId, scheduleItemId);
      return;
    }

    // 8. Tài khoản đã liên kết → Conversational Fast-Entry
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
        'ℹ️ Chưa tìm thấy thông tin ví của tài khoản liên kết.',
      );
      return;
    }

    const lines: string[] = ['📊 **TỔNG HỢP SỐ DƯ TÀI KHOẢN FINWISE**\n'];

    for (const s of settings) {
      const { fullName, wallets } = s.user;
      lines.push(`👤 **${fullName || 'Người dùng'}**:`);

      if (!wallets || wallets.length === 0) {
        lines.push('  *(Chưa có ví nào hoạt động)*');
      } else {
        let total = 0;
        for (const w of wallets) {
          const bal = Number(w.balance);
          total += bal;
          lines.push(`  • **${w.name}**: ${bal.toLocaleString('vi-VN')} ${w.currency}`);
        }
        lines.push(`  💰 **Tổng cộng**: **${total.toLocaleString('vi-VN')} VND**`);
      }
      lines.push('');
    }

    lines.push('💡 Nhắn tin tự nhiên như `Ăn sáng 30k` để ghi chép nhanh!');
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
      `📌 **Ghi chép nhanh:**\n` +
      `Chỉ cần nhắn tin tự nhiên là bot tự ghi vào sổ kế toán cho bạn!\n` +
      `• \`Cà phê sáng 35k ví tiền mặt\`\n` +
      `• \`Ăn trưa 50k\` *(tự dùng ví mặc định)*\n` +
      `• \`Vừa nhận lương 20tr ví VCB\`\n` +
      `• \`Đổ xăng 200k ví MoMo\`\n\n` +
      `✏️ **Sửa / Hoàn tác (trong vòng 15 phút):**\n` +
      `• Gõ \`hoàn tác\` hoặc \`hủy\` để đảo ngược giao dịch vừa tạo\n` +
      `• Gõ \`sửa thành 40k\` để đổi số tiền\n` +
      `• Gõ \`đổi ví VCB\` để đổi ví thanh toán\n\n` +
      `📌 **Quản lý Nợ & Trả nợ:**\n` +
      `• **/no** : Xem tổng quan nợ vay, cho mượn & kỳ sắp đến hạn\n` +
      `• **/tra_no <mã_kỳ>** : Xác nhận thanh toán kỳ nợ 1-chạm\n\n` +
      `📌 **Các lệnh khác:**\n` +
      `• **/status** : Xem tổng số dư các ví\n` +
      `• **/link <mã>** : Liên kết tài khoản FinWise (VD: /link FW-8492)\n` +
      `• **/unlink** : Hủy nhận thông báo trên Zalo này\n` +
      `• **/help** : Xem hướng dẫn sử dụng bot`;

    await zaloBotService.sendMessage(chatId, text);
  }

  /**
   * Tra cứu danh sách hợp đồng nợ và các kỳ sắp đến hạn qua lệnh /no
   */
  private async handleDebtListCommand(chatId: string, userId: string): Promise<void> {
    const contracts = await this.debtRepository.findActiveDebtsForBot(userId);

    if (contracts.length === 0) {
      await zaloBotService.sendMessage(
        chatId,
        `🎉 **BẠN KHÔNG CÓ KHOẢN NỢ NÀO ĐANG HOẠT ĐỘNG!**\n\n` +
        `Bạn hiện không có khoản nợ vay hay cho mượn nào cần theo dõi trên FinWise. Thật tuyệt vời! 👏`,
      );
      return;
    }

    let totalBorrowing = 0;
    let totalLending = 0;

    for (const c of contracts) {
      const rem = Number(c.remainingPrincipal);
      if (c.type === 'DEBT_PAYABLE') {
        totalBorrowing += rem;
      } else {
        totalLending += rem;
      }
    }

    const lines: string[] = [
      `📊 **TỔNG QUAN NỢ & CHO VAY (FINWISE)**`,
      `──────────────────────────────`,
      `🔴 **Nợ đang vay**: **${totalBorrowing.toLocaleString('vi-VN')} đ**`,
      `🟢 **Đang cho mượn**: **${totalLending.toLocaleString('vi-VN')} đ**`,
      `⚖️ **Nghĩa vụ thuần**: **${(totalBorrowing - totalLending).toLocaleString('vi-VN')} đ**\n`,
      `📌 **CÁC KỲ SẮP ĐẾN HẠN CẦN THANH TOÁN:**`,
    ];

    let hasUpcoming = false;

    for (const c of contracts) {
      for (const item of c.scheduleItems) {
        hasUpcoming = true;
        const dueDate = prismaDateToBusinessDate(item.dueDate);
        const totalDue = Number(item.totalDue).toLocaleString('vi-VN');
        const statusBadge = item.status === 'OVERDUE' ? '🚨 QUÁ HẠN' : '⏰ ĐẾN HẠN';

        lines.push(
          `\n• **${c.name}** (${c.counterparty})`,
          `  🔹 Kỳ: ${item.period} | Hạn: ${dueDate} (${statusBadge})`,
          `  💰 Số tiền: **${totalDue} đ**`,
          `  👉 Gõ: \`/tra_no ${item.id}\``,
        );
      }
    }

    if (!hasUpcoming) {
      lines.push('\n*(Không có kỳ nào sắp đến hạn trong thời gian gần)*');
    }

    await zaloBotService.sendMessage(chatId, lines.join('\n'));
  }

  /**
   * Xử lý thanh toán 1-chạm qua lệnh /tra_no <scheduleItemId>
   */
  private async handlePayDebtCommand(
    chatId: string,
    userId: string,
    scheduleItemId: string,
  ): Promise<void> {
    const item = await this.debtRepository.findScheduleItemForPay(scheduleItemId, userId);

    if (!item) {
      await zaloBotService.sendMessage(
        chatId,
        '❌ **Không tìm thấy kỳ nợ này!** Vui lòng kiểm tra lại mã kỳ nợ hoặc gõ **/no** để xem danh sách.',
      );
      return;
    }

    if (item.status === 'PAID') {
      await zaloBotService.sendMessage(
        chatId,
        `ℹ️ Kỳ số **${item.period}** của khoản "${item.debtContract.name}" đã được thanh toán trước đó rồi nhé!`,
      );
      return;
    }

    try {
      const result = await this.debtSettlementService.payInstallment(
        userId,
        item.debtContractId,
        item.period,
        {},
      );

      const totalPaidStr = result.settlementDetails.totalAmountPaid.toLocaleString('vi-VN');
      const principalStr = result.settlementDetails.principalPaid.toLocaleString('vi-VN');
      const interestStr = result.settlementDetails.interestPaid.toLocaleString('vi-VN');
      const remainingStr = Number(result.contract.remainingPrincipal).toLocaleString('vi-VN');

      const isReceivable = item.debtContract.type === 'LOAN_RECEIVABLE';
      const receiptMsg = isReceivable
        ? `✅ **XÁC NHẬN THU HỒI NỢ THÀNH CÔNG!**\n` +
          `──────────────────────────────\n` +
          `📌 **Khoản cho vay:** ${item.debtContract.name} (${item.debtContract.counterparty})\n` +
          `🔹 **Kỳ thu hồi:** Kỳ ${item.period}\n` +
          `💰 **Tổng tiền thu về:** **${totalPaidStr} đ**\n` +
          `   • Gốc thu hồi: ${principalStr} đ *(giảm nợ cho vay)*\n` +
          `   • Lãi nhận được: ${interestStr} đ *(ghi nhận Thu nhập lãi)*\n` +
          `📉 **Dư nợ gốc còn lại:** **${remainingStr} đ**\n\n` +
          (result.settlementDetails.isFullySettled
            ? `🎉 **CHÚC MỪNG:** BẠN ĐÃ THU HỒI TOÀN BỘ KHOẢN CHO VAY NÀY! 🏆`
            : `💡 Tiền đã được cộng vào ví và Báo cáo tài chính đã cập nhật tự động.`)
        : `✅ **THANH TOÁN KỲ NỢ THÀNH CÔNG!**\n` +
          `──────────────────────────────\n` +
          `📌 **Khoản nợ:** ${item.debtContract.name} (${item.debtContract.counterparty})\n` +
          `🔹 **Kỳ thanh toán:** Kỳ ${item.period}\n` +
          `💰 **Tổng tiền:** **${totalPaidStr} đ**\n` +
          `   • Gốc hoàn trả: ${principalStr} đ *(giảm nợ)*\n` +
          `   • Lãi phát sinh: ${interestStr} đ *(ghi nhận Chi phí lãi)*\n` +
          `📉 **Dư nợ gốc còn lại:** **${remainingStr} đ**\n\n` +
          (result.settlementDetails.isFullySettled
            ? `🎉 **CHÚC MỪNG:** BẠN ĐÃ TẤT TOÁN XONG TOÀN BỘ KHOẢN NỢ NÀY! 🏆`
            : `💡 Bảng kế toán và Tài sản ròng (Net Worth) của bạn đã được cập nhật tự động.`);

      await zaloBotService.sendMessage(chatId, receiptMsg);
    } catch (error: any) {
      this.logger.error(`Failed to pay installment ${scheduleItemId} via Zalo`, error);

      if (error?.code === 'INSUFFICIENT_BALANCE') {
        await zaloBotService.sendMessage(
          chatId,
          `⚠️ **Số dư ví không đủ!**\n\n` +
          `Ví thanh toán của bạn hiện không đủ tiền để chi trả cho kỳ nợ này. Vui lòng nạp thêm tiền vào ví hoặc mở **FinWise Mini App** để đổi ví thanh toán nhé!`,
        );
      } else {
        await zaloBotService.sendMessage(
          chatId,
          `❌ **Thanh toán thất bại:** ${error?.message || 'Lỗi hệ thống khi hạch toán. Vui lòng thử lại sau.'}`,
        );
      }
    }
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
