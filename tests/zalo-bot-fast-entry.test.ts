import { TransactionType } from '@prisma/client';
import {
  EntityContext,
  parseAmount,
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
