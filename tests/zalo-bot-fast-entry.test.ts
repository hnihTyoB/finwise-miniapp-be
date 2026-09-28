import { TransactionType } from '@prisma/client';
import {
  EntityContext,
  parseAmount,
  formatCategoryDisplayName,
  ZaloBotMicroParser,
} from '../src/modules/zalo-bot/services/zalo-bot-micro-parser';
import { BotConversationContext } from '../src/modules/zalo-bot/services/zalo-bot-fast-entry.dto';
import { zaloWebhookPayloadSchema } from '../src/modules/zalo-bot/zalo-bot.validation';

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
  });
});
