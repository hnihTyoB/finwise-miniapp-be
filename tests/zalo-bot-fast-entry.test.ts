import { TransactionType } from '@prisma/client';
import {
  EntityContext,
  parseAmount,
  formatCategoryDisplayName,
  ZaloBotMicroParser,
} from '../src/modules/zalo-bot/services/zalo-bot-micro-parser';
import { BotConversationContext } from '../src/modules/zalo-bot/services/zalo-bot-fast-entry.dto';
import { zaloWebhookPayloadSchema } from '../src/modules/zalo-bot/zalo-bot.validation';
import { zaloBotContextService } from '../src/modules/zalo-bot/services/zalo-bot-context.service';
import { zaloBotFastEntryService } from '../src/modules/zalo-bot/services/zalo-bot-fast-entry.service';
import { zaloBotRepository } from '../src/modules/zalo-bot/zalo-bot.repository';
import { zaloBotWebhookService } from '../src/modules/zalo-bot/services/zalo-bot-webhook.service';
import { zaloBotCommandDispatcher } from '../src/modules/zalo-bot/services/zalo-bot-command.dispatcher';

describe('Zalo Bot Fast-Entry Parser & Safeguards', () => {
  const mockEntityContext: EntityContext = {
    categories: [
      { id: 'cat-1', name: 'Cà phê', type: TransactionType.EXPENSE },
      { id: 'cat-2', name: 'Ăn trưa', type: TransactionType.EXPENSE },
      { id: 'cat-3', name: 'Lương', type: TransactionType.INCOME },
    ],
    wallets: [
      { id: 'wallet-1', name: 'Tiền mặt', currency: 'VND' },
      { id: 'wallet-2', name: 'VCB', currency: 'VND' },
    ],
    defaultWalletId: 'wallet-1',
  };

  const mockBotContext: BotConversationContext = {
    lastTransactionId: 'tx-existing-123',
    userId: 'user-456',
    createdAt: Date.now(),
  };

  describe('parseAmount — Vietnamese currency formatting', () => {
    it('correctly handles Vietnamese thousand dots (e.g. 35.000đ -> 35000)', () => {
      expect(parseAmount('35.000', 'đ')).toBe(35000);
      expect(parseAmount('35.000', 'vnd')).toBe(35000);
      expect(parseAmount('35.000', '')).toBe(35000);
    });

    it('correctly handles multiple thousand dots (e.g. 1.500.000đ -> 1500000)', () => {
      expect(parseAmount('1.500.000', 'đ')).toBe(1500000);
      expect(parseAmount('1,500,000', 'vnd')).toBe(1500000);
    });

    it('correctly handles decimal with k/tr multipliers (e.g. 35.5k -> 35500, 1.5tr -> 1500000)', () => {
      expect(parseAmount('35.5', 'k')).toBe(35500);
      expect(parseAmount('35,5', 'k')).toBe(35500);
      expect(parseAmount('1.5', 'tr')).toBe(1500000);
      expect(parseAmount('20', 'tr')).toBe(20000000);
    });

    it('handles standard plain integers', () => {
      expect(parseAmount('50', 'k')).toBe(50000);
      expect(parseAmount('35000', '')).toBe(35000);
    });
  });

  describe('Hijack Prevention: Delta Patch vs Mutation', () => {
    it('does NOT hijack new transaction when botContext exists and user sends a new expense without edit keywords', () => {
      // User creates a transaction, then 2 mins later sends "Ăn trưa 50k" without quoting
      const result = ZaloBotMicroParser.parse(
        'Ăn trưa 50k',
        mockEntityContext,
        mockBotContext,
        false, // not quote reply
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
      if (result.action === 'CREATE_TRANSACTION') {
        expect(result.amount).toBe(50000);
        expect(result.categoryName).toBe('Ăn trưa');
        expect(result.walletName).toBe('Tiền mặt');
      }
    });

    it('activates PATCH_TRANSACTION when user explicitly sends edit command', () => {
      const result = ZaloBotMicroParser.parse(
        'sửa thành 40k',
        mockEntityContext,
        mockBotContext,
        false,
      );

      expect(result.action).toBe('PATCH_TRANSACTION');
      if (result.action === 'PATCH_TRANSACTION') {
        expect(result.transactionId).toBe('tx-existing-123');
        expect(result.amount).toBe(40000);
      }
    });

    it('activates PATCH_TRANSACTION on bare number ONLY when isQuoteReply is true', () => {
      const quoteResult = ZaloBotMicroParser.parse(
        '40k',
        mockEntityContext,
        mockBotContext,
        true, // quote reply to bot message
      );

      expect(quoteResult.action).toBe('PATCH_TRANSACTION');
      if (quoteResult.action === 'PATCH_TRANSACTION') {
        expect(quoteResult.amount).toBe(40000);
      }

      // If not quote reply, bare number is ambiguous, NOT a silent patch
      const normalResult = ZaloBotMicroParser.parse(
        '40k',
        mockEntityContext,
        mockBotContext,
        false,
      );
      expect(normalResult.action).not.toBe('PATCH_TRANSACTION');
    });

    it('handles wallet change delta patch', () => {
      const result = ZaloBotMicroParser.parse(
        'đổi ví VCB',
        mockEntityContext,
        mockBotContext,
        false,
      );

      expect(result.action).toBe('PATCH_TRANSACTION');
      if (result.action === 'PATCH_TRANSACTION') {
        expect(result.walletId).toBe('wallet-2');
        expect(result.walletName).toBe('VCB');
      }
    });

    it('correctly detects undo command', () => {
      const result = ZaloBotMicroParser.parse(
        'hoàn tác',
        mockEntityContext,
        mockBotContext,
        false,
      );

      expect(result.action).toBe('UNDO_TRANSACTION');
      if (result.action === 'UNDO_TRANSACTION') {
        expect(result.transactionId).toBe('tx-existing-123');
      }
    });

    it('does NOT trigger undo when "hủy" is part of an expense description', () => {
      const result = ZaloBotMicroParser.parse(
        'Ăn trưa 50k phí hủy đơn',
        mockEntityContext,
        mockBotContext,
        false,
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
    });
  });

  describe('System Categories: English DB Names & Vietnamese Synonyms', () => {
    const systemDbEntityContext: EntityContext = {
      categories: [
        { id: 'cat-inc-1', name: 'Salary', type: TransactionType.INCOME },
        { id: 'cat-inc-2', name: 'Investment', type: TransactionType.INCOME },
        { id: 'cat-inc-3', name: 'Other Income', type: TransactionType.INCOME },
        { id: 'cat-exp-1', name: 'Food & Dining', type: TransactionType.EXPENSE },
        { id: 'cat-exp-2', name: 'Transport', type: TransactionType.EXPENSE },
        { id: 'cat-exp-3', name: 'Groceries', type: TransactionType.EXPENSE },
        { id: 'cat-exp-4', name: 'Bills & Utilities', type: TransactionType.EXPENSE },
        { id: 'cat-exp-5', name: 'Shopping', type: TransactionType.EXPENSE },
      ],
      wallets: [
        { id: 'w-cash', name: 'Tiền mặt', currency: 'VND' },
        { id: 'w-vcb', name: 'VCB', currency: 'VND' },
      ],
      defaultWalletId: 'w-cash',
    };

    it('correctly maps "Ăn trưa 50k" to "Food & Dining" system category', () => {
      const result = ZaloBotMicroParser.parse(
        'Ăn trưa 50k',
        systemDbEntityContext,
        null,
        false,
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
      if (result.action === 'CREATE_TRANSACTION') {
        expect(result.amount).toBe(50000);
        expect(result.type).toBe(TransactionType.EXPENSE);
        expect(result.categoryId).toBe('cat-exp-1');
        expect(result.categoryName).toBe('Food & Dining');
        expect(result.walletName).toBe('Tiền mặt');
      }
    });

    it('correctly maps "Đổ xăng 70k ví VCB" to "Transport" category and "VCB" wallet', () => {
      const result = ZaloBotMicroParser.parse(
        'Đổ xăng 70k ví VCB',
        systemDbEntityContext,
        null,
        false,
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
      if (result.action === 'CREATE_TRANSACTION') {
        expect(result.amount).toBe(70000);
        expect(result.type).toBe(TransactionType.EXPENSE);
        expect(result.categoryId).toBe('cat-exp-2');
        expect(result.categoryName).toBe('Transport');
        expect(result.walletId).toBe('w-vcb');
        expect(result.walletName).toBe('VCB');
      }
    });

    it('correctly maps "Nhận lương 20tr ví VCB" to "Salary" income category', () => {
      const result = ZaloBotMicroParser.parse(
        'Nhận lương 20tr ví VCB',
        systemDbEntityContext,
        null,
        false,
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
      if (result.action === 'CREATE_TRANSACTION') {
        expect(result.amount).toBe(20000000);
        expect(result.type).toBe(TransactionType.INCOME);
        expect(result.categoryId).toBe('cat-inc-1');
        expect(result.categoryName).toBe('Salary');
        expect(result.walletId).toBe('w-vcb');
      }
    });

    it('formats category display names with Vietnamese translation when available', () => {
      expect(formatCategoryDisplayName('Food & Dining')).toBe('Ăn uống (Food & Dining)');
      expect(formatCategoryDisplayName('Transport')).toBe('Di chuyển (Transport)');
      expect(formatCategoryDisplayName('Salary')).toBe('Lương (Salary)');
      expect(formatCategoryDisplayName('Danh mục tự tạo')).toBe('Danh mục tự tạo');
    });

    it('prevents substring false-positives using word boundaries (e.g. "Khăn mặt 50k" must not match "ăn")', () => {
      const result = ZaloBotMicroParser.parse(
        'Khăn mặt 50k',
        systemDbEntityContext,
        null,
        false,
      );

      // "Khăn mặt" does not match "ăn", so it triggers AMBIGUOUS category
      expect(result.action).toBe('AMBIGUOUS');
      if (result.action === 'AMBIGUOUS') {
        expect(result.missingField).toBe('category');
      }
    });

    it('prevents preposition "cho" from falsely matching Groceries ("Chuyển cho mẹ 500k ví VCB")', () => {
      const result = ZaloBotMicroParser.parse(
        'Chuyển cho mẹ 500k ví VCB',
        systemDbEntityContext,
        null,
        false,
      );

      // Should not classify as Groceries
      expect(result.action).toBe('AMBIGUOUS');
      if (result.action === 'AMBIGUOUS') {
        expect(result.missingField).toBe('category');
      }
    });

    it('handles leading and trailing whitespace cleanly ("  Ăn trưa 50k ví VCB  ")', () => {
      const result = ZaloBotMicroParser.parse(
        '  Ăn trưa 50k ví VCB  ',
        systemDbEntityContext,
        null,
        false,
      );

      expect(result.action).toBe('CREATE_TRANSACTION');
      if (result.action === 'CREATE_TRANSACTION') {
        expect(result.amount).toBe(50000);
        expect(result.categoryName).toBe('Food & Dining');
        expect(result.walletName).toBe('VCB');
      }
    });
  });

  describe('Custom & Weird Wallet Names, Diacritics & Bank Aliases', () => {
    const customWalletContext: EntityContext = {
      categories: [
        { id: 'cat-food', name: 'Food & Dining', type: TransactionType.EXPENSE },
        { id: 'cat-drink', name: 'Entertainment', type: TransactionType.EXPENSE },
      ],
      wallets: [
        { id: 'w-default', name: 'Tiền mặt', currency: 'VND' },
        { id: 'w-black', name: 'Quỹ đen', currency: 'VND' },
        { id: 'w-pig', name: 'Heo đất', currency: 'VND' },
        { id: 'w-wife', name: 'Ví giấu vợ', currency: 'VND' },
        { id: 'w-vcb', name: 'Vietcombank', currency: 'VND' },
      ],
      defaultWalletId: 'w-default',
    };

    it('matches custom/weird wallet name with accents ("Ăn trưa 50k ví quỹ đen")', () => {
      const res = ZaloBotMicroParser.parse('Ăn trưa 50k ví quỹ đen', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-black');
        expect(res.walletName).toBe('Quỹ đen');
        expect(res.amount).toBe(50000);
      }
    });

    it('matches custom wallet name typed WITHOUT accents ("Ăn trưa 50k vi quy den")', () => {
      const res = ZaloBotMicroParser.parse('Ăn trưa 50k vi quy den', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-black');
        expect(res.walletName).toBe('Quỹ đen');
      }
    });

    it('matches funny wallet name ("Bia 200k ví giấu vợ")', () => {
      const res = ZaloBotMicroParser.parse('Bia 200k ví giấu vợ', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-wife');
        expect(res.walletName).toBe('Ví giấu vợ');
        expect(res.amount).toBe(200000);
      }
    });

    it('matches standalone custom wallet without "ví" keyword ("Ăn trưa 50k heo đất")', () => {
      const res = ZaloBotMicroParser.parse('Ăn trưa 50k heo đất', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-pig');
        expect(res.walletName).toBe('Heo đất');
      }
    });

    it('matches bank alias when wallet in DB is "Vietcombank" but user chats "ví vcb"', () => {
      const res = ZaloBotMicroParser.parse('Ăn trưa 50k ví vcb', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-vcb');
        expect(res.walletName).toBe('Vietcombank');
      }
    });

    it('falls back to default wallet when no wallet is specified ("Ăn trưa 50k")', () => {
      const res = ZaloBotMicroParser.parse('Ăn trưa 50k', customWalletContext, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        expect(res.walletId).toBe('w-default');
        expect(res.walletName).toBe('Tiền mặt');
      }
    });

    it('prevents wallet prefix from matching partial words ("Ăn trưa 50k tk 100k")', () => {
      const ctxWithNumericWallet: EntityContext = {
        categories: [
          { id: 'cat-food', name: 'Food & Dining', type: TransactionType.EXPENSE },
        ],
        wallets: [
          { id: 'w-default', name: 'Tiền mặt', currency: 'VND' },
          { id: 'w-one', name: '1', currency: 'VND' },
        ],
        defaultWalletId: 'w-default',
      };

      const res = ZaloBotMicroParser.parse('Ăn trưa 50k tk 100k', ctxWithNumericWallet, null, false);
      expect(res.action).toBe('CREATE_TRANSACTION');
      if (res.action === 'CREATE_TRANSACTION') {
        // "tk 1" must NOT match "1" inside "100k", it should fallback to default wallet
        expect(res.walletId).toBe('w-default');
        expect(res.walletName).toBe('Tiền mặt');
      }
    });
  });

  describe('Zalo Webhook Validation Schema', () => {
    it('successfully parses valid webhook payload with quote-reply fields', () => {
      const payload = {
        ok: true,
        result: {
          event_name: 'message.text.received',
          message: {
            id: 'msg-999',
            text: 'sửa thành 40k',
            chat: { id: 'chat-123' },
            from: { id: 'from-123', display_name: 'Nguyen Van A' },
            replied_to_message: { message_id: 'bot-msg-001' },
          },
        },
      };

      const parsed = zaloWebhookPayloadSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('successfully parses Telegram/Zalo Bot standard reply_to_message with numeric message_id', () => {
      const payload = {
        ok: true,
        result: {
          event_name: 'message.text.received',
          message: {
            message_id: 123456,
            text: 'hoàn tác',
            chat: { id: 789012 },
            from: { id: 789012, display_name: 'Tran B' },
            reply_to_message: {
              message_id: 10001,
              text: 'Cà phê sáng 35k ví tiền mặt',
            },
          },
        },
      };

      const parsed = zaloWebhookPayloadSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('successfully parses Zalo OA standard quote_message_id', () => {
      const payload = {
        ok: true,
        result: {
          event_name: 'message.text.received',
          message: {
            msg_id: 'msg-002',
            text: 'sửa thành 50k',
            chat_id: 'chat-456',
            from_id: 'user-789',
            quote_message_id: 'quoted-bot-msg-999',
          },
        },
      };

      const parsed = zaloWebhookPayloadSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('zaloBotWebhookService extracts replyToMsgId from reply_to_message correctly and passes to dispatcher', async () => {
      const dispatchSpy = jest.spyOn(zaloBotCommandDispatcher, 'dispatch').mockResolvedValue(undefined);

      const payload = {
        ok: true,
        result: {
          event_name: 'message.text.received',
          message: {
            message_id: 'msg-unique-test-1',
            text: 'hoàn tác',
            chat: { id: 'chat-webhook-test' },
            from: { id: 'user-webhook-test', display_name: 'Nguyen Test' },
            reply_to_message: {
              message_id: 'original-tx-msg-001',
            },
          },
        },
      };

      await zaloBotWebhookService.processWebhook(payload);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'chat-webhook-test',
          text: 'hoàn tác',
          replyToMsgId: 'original-tx-msg-001',
          userMessageId: 'msg-unique-test-1',
        }),
      );

      dispatchSpy.mockRestore();
    });
  });

  describe('Quote-Reply Multi-Message Targeting vs Latest Chat Context', () => {
    const chatId = 'chat-target-test-1';
    const userId = 'user-target-test-1';

    beforeEach(async () => {
      // Clear test chat context
      await zaloBotContextService.clearContext(chatId);
    });

    it('correctly maps both user message ID and bot confirmation message ID to transactionId', async () => {
      await zaloBotContextService.saveMsgToTx('user-msg-001', 'tx-test-101', userId);
      await zaloBotContextService.saveMsgToTx('bot-msg-001', 'tx-test-101', userId);

      const fromUser = await zaloBotContextService.getTxFromMsg('user-msg-001');
      const fromBot = await zaloBotContextService.getTxFromMsg('bot-msg-001');

      expect(fromUser).toEqual({ transactionId: 'tx-test-101', userId });
      expect(fromBot).toEqual({ transactionId: 'tx-test-101', userId });
    });

    it('undoes Message #1 when user quote-replies to Message #1 in a 3-message sequence', async () => {
      // Giả lập chuỗi 3 giao dịch được gửi liên tiếp:
      // Tin 1: Cà phê 30k -> tx-1
      await zaloBotContextService.saveMsgToTx('user-m1', 'tx-1', userId);
      await zaloBotContextService.saveMsgToTx('bot-m1', 'tx-1', userId);
      await zaloBotContextService.saveContext(chatId, {
        lastTransactionId: 'tx-1',
        userId,
        createdAt: Date.now(),
      });

      // Tin 2: Ăn trưa 50k -> tx-2
      await zaloBotContextService.saveMsgToTx('user-m2', 'tx-2', userId);
      await zaloBotContextService.saveMsgToTx('bot-m2', 'tx-2', userId);
      await zaloBotContextService.saveContext(chatId, {
        lastTransactionId: 'tx-2',
        userId,
        createdAt: Date.now(),
      });

      // Tin 3: Đổ xăng 70k -> tx-3 (đây là context gần nhất của chat)
      await zaloBotContextService.saveMsgToTx('user-m3', 'tx-3', userId);
      await zaloBotContextService.saveMsgToTx('bot-m3', 'tx-3', userId);
      await zaloBotContextService.saveContext(chatId, {
        lastTransactionId: 'tx-3',
        userId,
        createdAt: Date.now(),
      });

      // ── Tình huống 1: Người dùng Quote-Reply tin nhắn #1 (hoặc bot reply của tin 1) với "hoàn tác" ──
      // Context resolver phải tra cứu theo replyMsgId và tìm thấy tx-1, TUYỆT ĐỐI KHÔNG lấy tx-3!
      const ctxForReply1 = await (zaloBotFastEntryService as any).resolveConversationContext(
        chatId,
        'user-m1',
      );
      expect(ctxForReply1).not.toBeNull();
      expect(ctxForReply1?.lastTransactionId).toBe('tx-1');

      const undoIntent1 = ZaloBotMicroParser.parse('hoàn tác', mockEntityContext, ctxForReply1, true);
      expect(undoIntent1.action).toBe('UNDO_TRANSACTION');
      if (undoIntent1.action === 'UNDO_TRANSACTION') {
        expect(undoIntent1.transactionId).toBe('tx-1'); // Hoàn tác đúng tin 1, KHÔNG PHẢI tin 3!
      }

      // ── Tình huống 2: Người dùng Quote-Reply tin nhắn #1 với "sửa thành 35k" ──
      const patchIntent1 = ZaloBotMicroParser.parse('sửa thành 35k', mockEntityContext, ctxForReply1, true);
      expect(patchIntent1.action).toBe('PATCH_TRANSACTION');
      if (patchIntent1.action === 'PATCH_TRANSACTION') {
        expect(patchIntent1.transactionId).toBe('tx-1');
        expect(patchIntent1.amount).toBe(35000);
      }

      // ── Tình huống 3: Người dùng Quote-Reply tin nhắn #2 với "đổi ví VCB" ──
      const ctxForReply2 = await (zaloBotFastEntryService as any).resolveConversationContext(
        chatId,
        'bot-m2',
      );
      expect(ctxForReply2?.lastTransactionId).toBe('tx-2');

      const patchIntent2 = ZaloBotMicroParser.parse('đổi ví VCB', mockEntityContext, ctxForReply2, true);
      expect(patchIntent2.action).toBe('PATCH_TRANSACTION');
      if (patchIntent2.action === 'PATCH_TRANSACTION') {
        expect(patchIntent2.transactionId).toBe('tx-2');
        expect(patchIntent2.walletId).toBe('wallet-2');
      }

      // ── Tình huống 4: Người dùng KHÔNG Quote-Reply mà gõ thẳng "hoàn tác" ──
      // Lúc này mới fallback về context gần nhất của chat (tx-3)
      const ctxNormal = await (zaloBotFastEntryService as any).resolveConversationContext(
        chatId,
        undefined, // không quote-reply
      );
      expect(ctxNormal?.lastTransactionId).toBe('tx-3');

      const undoIntentNormal = ZaloBotMicroParser.parse('hoàn tác', mockEntityContext, ctxNormal, false);
      expect(undoIntentNormal.action).toBe('UNDO_TRANSACTION');
      if (undoIntentNormal.action === 'UNDO_TRANSACTION') {
        expect(undoIntentNormal.transactionId).toBe('tx-3');
      }
    });

    it('does NOT fallback to chat context when quote-replying to an unknown/unrelated message', async () => {
      // Đặt context chat hiện tại là tx-999
      await zaloBotContextService.saveContext(chatId, {
        lastTransactionId: 'tx-999',
        userId,
        createdAt: Date.now(),
      });

      // Người dùng quote một tin nhắn không có trong hệ thống (vd tin nhắn tán gẫu của bạn bè)
      const ctxUnrelated = await (zaloBotFastEntryService as any).resolveConversationContext(
        chatId,
        'unrelated-msg-id',
      );

      // Phải trả về null, KHÔNG ĐƯỢC fallback về tx-999
      expect(ctxUnrelated).toBeNull();
    });

    it('rejects undo/patch safely when quote-reply target message is unlinked without corrupting chat context', async () => {
      // Mock repository and transactions to prevent DB calls
      jest.spyOn(zaloBotRepository, 'loadUserEntities').mockResolvedValue({
        categories: mockEntityContext.categories as any,
        wallets: mockEntityContext.wallets as any,
      });

      // Đặt context chat gần nhất là tx-active
      await zaloBotContextService.saveContext(chatId, {
        lastTransactionId: 'tx-active',
        userId,
        createdAt: Date.now(),
      });

      // User quote một tin không tồn tại và gõ "hoàn tác"
      const res = await zaloBotFastEntryService.handleMessage(
        chatId,
        userId,
        'hoàn tác',
        'non-existent-msg-id',
      );

      expect(res.replyText).toContain('Không tìm thấy giao dịch liên kết với tin nhắn bạn đang trả lời');

      // Đảm bảo tx-active trong chat context không bị xóa hay ảnh hưởng
      const activeCtx = await zaloBotContextService.getContext(chatId);
      expect(activeCtx?.lastTransactionId).toBe('tx-active');
    });

    it('still creates a new transaction when user quote-replies to an unlinked message with a full expense', async () => {
      jest.spyOn(zaloBotRepository, 'loadUserEntities').mockResolvedValue({
        categories: mockEntityContext.categories as any,
        wallets: mockEntityContext.wallets as any,
      });
      jest.spyOn((zaloBotFastEntryService as any).transactionService, 'create').mockResolvedValue({
        id: 'new-tx-created',
      });
      jest.spyOn(zaloBotRepository, 'getWallet').mockResolvedValue({
        id: 'wallet-1',
        name: 'Tiền mặt',
        balance: 1000000,
        currency: 'VND',
      } as any);
      jest.spyOn(zaloBotRepository, 'findCategoryBudget').mockResolvedValue(null);

      // User quote một tin nhắn không phải tx (vd ảnh hóa đơn) và nhập "Ăn trưa 50k"
      const res = await zaloBotFastEntryService.handleMessage(
        chatId,
        userId,
        'Ăn trưa 50k',
        'unlinked-photo-msg',
        'user-new-msg',
      );

      expect(res.transactionId).toBe('new-tx-created');
      expect(res.replyText).toContain('GHI NHẬN CHI TIÊU THÀNH CÔNG');

      // Tin nhắn người dùng vừa gửi phải được liên kết với giao dịch mới
      const userMsgMapping = await zaloBotContextService.getTxFromMsg('user-new-msg');
      expect(userMsgMapping?.transactionId).toBe('new-tx-created');
    });
  });
});
