import { TransactionType } from '@prisma/client';
import { LoggerService } from '../../../common/services/logger.service';
import { instantToBusinessDate } from '../../../common/date-time/business-time';
import { TransactionService } from '../../transactions/transaction.service';
import { zaloBotRepository } from '../zalo-bot.repository';
import { EntityContext, ZaloBotMicroParser } from './zalo-bot-micro-parser';
import { zaloBotContextService } from './zalo-bot-context.service';
import {
  AmbiguousIntent,
  BotConversationContext,
  DeltaPatchAST,
  FastEntryResult,
  MutationAST,
  ParsedIntent,
  UndoIntent,
} from './zalo-bot-fast-entry.dto';

/** URL base của Mini App (cấu hình qua env hoặc fallback). */
const MINI_APP_DEEP_LINK_BASE =
  process.env.ZALO_MINI_APP_DEEP_LINK_BASE ?? 'https://zalo.me/s/finwise';

/**
 * Orchestration service cho Conversational Fast-Entry.
 *
 * Luồng xử lý chính tuân thủ quy tắc phân tầng:
 *   Controller/Dispatcher -> Service -> Repository / Sub-services
 */
export class ZaloBotFastEntryService {
  private readonly logger = new LoggerService('ZaloBotFastEntryService');
  private readonly transactionService = new TransactionService();

  // ─── Entry Point ────────────────────────────────────────────────────────────

  /**
   * Xử lý tin nhắn đến từ người dùng đã liên kết FinWise.
   *
   * @param chatId        - chat.id từ Zalo Webhook
   * @param userId        - userId FinWise đã xác thực qua NotificationSetting
   * @param text          - Nội dung tin nhắn thô
   * @param replyMsgId    - message_id tin nhắn Bot mà người dùng đang quote-reply (nếu có)
   * @returns             - Chuỗi Markdown để gửi về cho người dùng
   */
  async handleMessage(
    chatId: string,
    userId: string,
    text: string,
    replyMsgId?: string,
  ): Promise<string> {
    try {
      const isQuoteReply = Boolean(replyMsgId);

      // Bước 1: Nạp context thực thể và hội thoại song song qua repository & cache
      const [entityCtx, botCtx] = await Promise.all([
        this.loadEntityContext(userId),
        this.resolveConversationContext(chatId, replyMsgId),
      ]);

      // Bước 2: Phân tích ý định
      const intent = ZaloBotMicroParser.parse(text, entityCtx, botCtx, isQuoteReply);
      this.logger.debug(`Parsed intent for chat ${chatId}`, {
        action: intent.action,
        isQuoteReply,
      });

      // Bước 3: Thực thi ý định
      return await this.executeIntent(intent, chatId, userId, entityCtx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`FastEntry error for chat ${chatId}:`, err);
      return this.buildErrorCard(message);
    }
  }

  // ─── Intent Router ──────────────────────────────────────────────────────────

  private async executeIntent(
    intent: ParsedIntent,
    chatId: string,
    userId: string,
    entityCtx: EntityContext,
  ): Promise<string> {
    switch (intent.action) {
      case 'CREATE_TRANSACTION':
        return this.executeCreate(intent as MutationAST, chatId, userId, entityCtx);

      case 'PATCH_TRANSACTION':
        return this.executePatch(intent as DeltaPatchAST, chatId, userId);

      case 'UNDO_TRANSACTION':
        return this.executeUndo(intent as UndoIntent, chatId, userId);

      case 'AMBIGUOUS':
      default:
        return this.buildAmbiguousCard(intent as AmbiguousIntent, entityCtx);
    }
  }

  // ─── CREATE TRANSACTION ──────────────────────────────────────────────────────

  private async executeCreate(
    ast: MutationAST,
    chatId: string,
    userId: string,
    _entityCtx: EntityContext,
  ): Promise<string> {
    const today = instantToBusinessDate(new Date());
    const amountStr = ast.amount.toString();

    // Ghi sổ cái nguyên tử qua TransactionService (bảo đảm quan hệ, số dư và audit log)
    const created = await this.transactionService.create(userId, {
      walletId: ast.walletId,
      categoryId: ast.categoryId,
      amount: amountStr,
      type: ast.type,
      description: ast.description || null,
      location: null,
      date: today,
    });

    // Lấy số dư ví mới qua repository
    const wallet = await zaloBotRepository.getWallet(ast.walletId, userId);

    // Truy vấn ngân sách danh mục (nếu có)
    const budgetInfo = await this.findCategoryBudget(userId, ast.categoryId, ast.type, today);

    // Lưu context hội thoại trong Redis
    const ctx: BotConversationContext = {
      lastTransactionId: created.id,
      userId,
      createdAt: Date.now(),
    };
    await zaloBotContextService.saveContext(chatId, ctx);

    const result: FastEntryResult = {
      transactionId: created.id,
      type: ast.type,
      amount: ast.amount,
      categoryName: ast.categoryName,
      walletName: ast.walletName,
      newBalance: wallet ? Number(wallet.balance) : 0,
      currency: wallet?.currency ?? 'VND',
      description: ast.description || '',
      date: today,
      budget: budgetInfo,
    };

    return this.buildSuccessCard(result, created.id);
  }

  // ─── PATCH TRANSACTION ────────────────────────────────────────────────────────

  private async executePatch(
    ast: DeltaPatchAST,
    chatId: string,
    userId: string,
  ): Promise<string> {
    // Kiểm tra ownership qua repository
    const current = await zaloBotRepository.getTransactionWithDetails(ast.transactionId, userId);

    if (!current) {
      return '❌ **Không tìm thấy giao dịch cần sửa** hoặc giao dịch không thuộc về bạn.';
    }

    // Cập nhật qua TransactionService để đảm bảo số dư ví đảo ngược/áp dụng đúng
    const updated = await this.transactionService.update(userId, ast.transactionId, {
      ...(ast.amount !== undefined ? { amount: ast.amount.toString() } : {}),
      ...(ast.walletId !== undefined ? { walletId: ast.walletId } : {}),
      ...(ast.categoryId !== undefined ? { categoryId: ast.categoryId } : {}),
      ...(ast.type !== undefined ? { type: ast.type } : {}),
      ...(ast.description !== undefined ? { description: ast.description } : {}),
    });

    // Cập nhật context với cùng txId (vẫn có thể hoàn tác sau khi sửa)
    await zaloBotContextService.saveContext(chatId, {
      lastTransactionId: ast.transactionId,
      userId,
      createdAt: Date.now(),
    });

    const wallet = await zaloBotRepository.getWallet(updated.walletId, userId);
    const newBalance = wallet ? Number(wallet.balance) : 0;
    const currency = wallet?.currency ?? 'VND';

    const changeLines: string[] = [];
    if (ast.amount !== undefined) {
      changeLines.push(
        `• Số tiền: **${this.formatMoney(Number(current.amount))} ${currency}** → **${this.formatMoney(ast.amount)} ${currency}**`,
      );
    }
    if (ast.walletId !== undefined && ast.walletName) {
      changeLines.push(`• Ví: **${current.wallet.name}** → **${ast.walletName}**`);
    }
    if (ast.categoryId !== undefined && ast.categoryName) {
      changeLines.push(`• Danh mục: **${current.category.name}** → **${ast.categoryName}**`);
    }
    if (ast.description !== undefined) {
      changeLines.push(`• Ghi chú: **${ast.description}**`);
    }
    if (ast.type !== undefined) {
      changeLines.push(`• Loại: **${this.formatType(ast.type)}**`);
    }

    return [
      `✏️ **ĐÃ CẬP NHẬT GIAO DỊCH!**`,
      ``,
      ...changeLines,
      `• Số dư ví mới: **${this.formatMoney(newBalance)} ${currency}**`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `⚡ *Gõ /undo hoặc "hoàn tác" để đảo ngược trong vòng 15 phút.*`,
    ].join('\n');
  }

  // ─── UNDO TRANSACTION ─────────────────────────────────────────────────────────

  private async executeUndo(
    intent: UndoIntent,
    chatId: string,
    userId: string,
  ): Promise<string> {
    // Kiểm tra ownership qua repository
    const tx = await zaloBotRepository.getTransactionWithDetails(intent.transactionId, userId);

    if (!tx) {
      return '❌ **Không tìm thấy giao dịch để hoàn tác** hoặc bạn không có quyền trên giao dịch này.';
    }

    const amount = Number(tx.amount);
    const categoryName = tx.category.name;
    const walletName = tx.wallet.name;
    const currency = tx.wallet.currency;

    // Xóa giao dịch qua TransactionService (đảo ngược số dư nguyên tử)
    await this.transactionService.delete(userId, intent.transactionId);

    // Lấy số dư mới sau khi hoàn tác
    const wallet = await zaloBotRepository.getWallet(tx.walletId, userId);
    const newBalance = wallet ? Number(wallet.balance) : 0;

    // Xóa context để tránh double-undo
    await zaloBotContextService.clearContext(chatId);

    return [
      `↩️ **ĐÃ HOÀN TÁC GIAO DỊCH THÀNH CÔNG!**`,
      ``,
      `• Đã xóa: **${categoryName}** — **${this.formatMoney(amount)} ${currency}**`,
      `• Ví **${walletName}** đã được hoàn lại **${this.formatMoney(amount)} ${currency}**`,
      `• Số dư hiện tại: **${this.formatMoney(newBalance)} ${currency}**`,
    ].join('\n');
  }

  // ─── AMBIGUOUS ────────────────────────────────────────────────────────────────

  private buildAmbiguousCard(intent: AmbiguousIntent, entityCtx: EntityContext): string {
    const walletExamples = entityCtx.wallets.slice(0, 3).map((w) => w.name).join(', ');
    const catExamples = entityCtx.categories.slice(0, 3).map((c) => c.name).join(', ');

    switch (intent.missingField) {
      case 'amount':
        return [
          `🤔 **FinWise chưa nhận ra được số tiền!**`,
          ``,
          `Bạn muốn ghi chép giao dịch gì không? Hãy gửi lại kèm số tiền nhé!`,
          ``,
          `📌 *Ví dụ:*`,
          `• \`Cà phê sáng 35k ví tiền mặt\``,
          `• \`Ăn trưa 50k\``,
          `• \`Vừa nhận lương 20tr ví VCB\``,
        ].join('\n');

      case 'wallet':
        return [
          `🤔 **Bạn muốn dùng ví nào?**`,
          ``,
          `Các ví của bạn: **${walletExamples}**`,
          ``,
          `Gửi lại với tên ví, ví dụ: \`${intent.partial.amount ? this.formatMoney(intent.partial.amount) + 'đ ' : ''}ví ${entityCtx.wallets[0]?.name ?? 'Tiền mặt'}\``,
        ].join('\n');

      case 'category':
        return [
          `🤔 **Giao dịch này thuộc danh mục nào?**`,
          ``,
          `Danh mục gợi ý: **${catExamples}**`,
          ``,
          `Gửi lại kèm danh mục, ví dụ: \`Cà phê 35k ví tiền mặt\``,
        ].join('\n');

      default:
        return `🤔 FinWise chưa hiểu tin nhắn này. Hãy thử: \`Cà phê sáng 35k ví tiền mặt\``;
    }
  }

  // ─── Reply Card Builder ───────────────────────────────────────────────────────

  private buildSuccessCard(result: FastEntryResult, txId: string): string {
    const isIncome = result.type === TransactionType.INCOME;
    const icon = isIncome ? '💰' : '💸';
    const sign = isIncome ? '+' : '-';
    const title = isIncome ? '🎉 GHI NHẬN THU NHẬP THÀNH CÔNG' : '✅ GHI NHẬN CHI TIÊU THÀNH CÔNG';

    const lines: string[] = [
      `${title}`,
      ``,
      `${icon} **Số tiền:** ${sign}${this.formatMoney(result.amount)} ${result.currency}`,
      `📂 **Danh mục:** ${result.categoryName}`,
      `💼 **Tài khoản:** Ví ${result.walletName}`,
    ];

    if (result.description) {
      lines.push(`📝 **Ghi chú:** ${result.description}`);
    }

    lines.push(`🕒 **Ngày:** ${this.formatDate(result.date)}`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📊 **TÌNH HÌNH TÀI CHÍNH TỨC THÌ**`);
    lines.push(`• Số dư mới [Ví ${result.walletName}]: **${this.formatMoney(result.newBalance)} ${result.currency}**`);

    // Ngân sách
    if (result.budget) {
      const b = result.budget;
      const pct = Math.round(b.usagePercentage);
      const bar = this.buildProgressBar(pct);
      const statusIcon = b.status === 'EXCEEDED' ? '🔴' : b.status === 'NEAR_LIMIT' ? '🟡' : '🟢';
      lines.push(`• Ngân sách [${b.name}]:`);
      lines.push(`  ${bar} ${statusIcon} ${pct}%`);
      lines.push(`  👉 Còn lại: **${this.formatMoney(b.remainingAmount)} ${b.currency}**`);
    }

    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚡ **THAO TÁC NHANH:**`);
    lines.push(`👉 [Mở Mini App sửa giao dịch này](${MINI_APP_DEEP_LINK_BASE}?screen=transaction-edit&id=${txId}&source=zalo_bot)`);
    lines.push(`💬 *Hoặc gõ "hoàn tác" / "sửa thành Xk" ngay trong chat này (trong vòng 15 phút).*`);

    return lines.join('\n');
  }

  private buildErrorCard(message: string): string {
    return [
      `❌ **Đã xảy ra lỗi khi ghi chép giao dịch!**`,
      ``,
      `> ${message}`,
      ``,
      `Vui lòng thử lại hoặc mở **FinWise Mini App** để ghi chép thủ công.`,
    ].join('\n');
  }

  // ─── Budget Lookup ─────────────────────────────────────────────────────────

  private async findCategoryBudget(
    userId: string,
    categoryId: string,
    type: TransactionType,
    today: string,
  ): Promise<FastEntryResult['budget']> {
    if (type !== TransactionType.EXPENSE) return null;
    return zaloBotRepository.findCategoryBudget(userId, categoryId, today);
  }

  // ─── Formatters ───────────────────────────────────────────────────────────────

  private formatMoney(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
  }

  private formatDate(date: string): string {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }

  private formatType(type: TransactionType): string {
    switch (type) {
      case TransactionType.INCOME:  return 'Thu nhập';
      case TransactionType.EXPENSE: return 'Chi tiêu';
      default:                      return type;
    }
  }

  private buildProgressBar(pct: number): string {
    const filled = Math.min(Math.round(pct / 10), 10);
    const empty = 10 - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  // ─── EntityContext Loader ─────────────────────────────────────────────────────

  private async loadEntityContext(userId: string): Promise<EntityContext> {
    const { categories, wallets } = await zaloBotRepository.loadUserEntities(userId);
    const defaultWallet = wallets.find((w) => w.isDefault);

    return {
      categories,
      wallets,
      defaultWalletId: defaultWallet?.id ?? (wallets[0]?.id ?? null),
    };
  }

  // ─── Conversation Context Resolver ───────────────────────────────────────────

  /**
   * Ưu tiên: Quote-Reply (24h) > Chat nối tiếp (15 phút)
   */
  private async resolveConversationContext(
    chatId: string,
    replyMsgId?: string,
  ): Promise<BotConversationContext | null> {
    if (replyMsgId) {
      const msgCtx = await zaloBotContextService.getTxFromMsg(replyMsgId);
      if (msgCtx) {
        return {
          lastTransactionId: msgCtx.transactionId,
          userId: msgCtx.userId,
          createdAt: Date.now(),
        };
      }
    }
    return zaloBotContextService.getContext(chatId);
  }
}

export const zaloBotFastEntryService = new ZaloBotFastEntryService();
