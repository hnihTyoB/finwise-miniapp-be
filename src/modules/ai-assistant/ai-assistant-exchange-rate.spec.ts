import { currencyExchangeRateSchema } from './ai-assistant.validation';
import { exchangeRateResponseSchema } from './ai-assistant-response.validation';
import { AIAssistantService } from './ai-assistant.service';
import { getAIProvider } from '../../common/ai/ai-provider.factory';
import { systemSettingService } from '../system-settings/system-setting.service';

jest.mock('../../common/ai/ai-provider.factory', () => ({
  getAIProvider: jest.fn(),
}));

jest.mock('./admin-ai.repository', () => ({
  adminAiRepository: {
    createLog: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../system-settings/system-setting.service', () => ({
  systemSettingService: {
    getBoolean: jest.fn().mockResolvedValue(true),
  },
}));

describe('Currency Exchange Rate AI & Validation Tests', () => {
  describe('currencyExchangeRateSchema', () => {
    it('should validate and transform valid currency codes', () => {
      const result = currencyExchangeRateSchema.parse({
        from: 'usd',
        to: 'vnd',
        amount: 100,
      });

      expect(result.from).toBe('USD');
      expect(result.to).toBe('VND');
      expect(result.amount).toBe(100);
    });

    it('should default amount to 1 when omitted', () => {
      const result = currencyExchangeRateSchema.parse({
        from: 'EUR',
        to: 'USD',
      });

      expect(result.amount).toBe(1);
    });

    it('should reject invalid currency codes', () => {
      expect(() =>
        currencyExchangeRateSchema.parse({
          from: 'US',
          to: 'VND',
        }),
      ).toThrow();

      expect(() =>
        currencyExchangeRateSchema.parse({
          from: '123',
          to: 'VND',
        }),
      ).toThrow();
    });

    it('should reject non-positive amounts', () => {
      expect(() =>
        currencyExchangeRateSchema.parse({
          from: 'USD',
          to: 'VND',
          amount: -5,
        }),
      ).toThrow();
    });
  });

  describe('exchangeRateResponseSchema', () => {
    it('should validate structured AI response', () => {
      const parsed = exchangeRateResponseSchema.parse({
        from: 'USD',
        to: 'VND',
        rate: 25450,
        note: 'Tỷ giá thị trường tự do tham khảo',
      });

      expect(parsed.from).toBe('USD');
      expect(parsed.to).toBe('VND');
      expect(parsed.rate).toBe(25450);
      expect(parsed.note).toBe('Tỷ giá thị trường tự do tham khảo');
    });

    it('should accept string rate and convert to number', () => {
      const parsed = exchangeRateResponseSchema.parse({
        from: 'EUR',
        to: 'USD',
        rate: '1.085',
      });

      expect(parsed.rate).toBe(1.085);
    });
  });

  describe('AIAssistantService.getExchangeRate', () => {
    let service: AIAssistantService;

    beforeEach(() => {
      jest.clearAllMocks();
      (systemSettingService.getBoolean as jest.Mock).mockResolvedValue(true);
      service = new AIAssistantService();
    });

    it('should return identity rate 1 with 0 tokens when from equals to', async () => {
      const result = await service.getExchangeRate('test-user-id', {
        from: 'USD',
        to: 'USD',
        amount: 50,
      });

      expect(result.data.from).toBe('USD');
      expect(result.data.to).toBe('USD');
      expect(result.data.rate).toBe(1);
      expect(result.data.amount).toBe(50);
      expect(result.data.convertedAmount).toBe(50);
      expect(result.meta.usage.totalTokens).toBe(0);
      expect(getAIProvider).not.toHaveBeenCalled();
    });

    it('should call AI provider when currencies differ and return accurate calculation', async () => {
      const mockGenerate = jest.fn().mockResolvedValue({
        data: {
          from: 'USD',
          to: 'VND',
          rate: 25400,
          note: 'Tỷ giá tham khảo Vietcombank',
        },
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        usage: { promptTokens: 35, completionTokens: 18, totalTokens: 53 },
      });

      (getAIProvider as jest.Mock).mockReturnValue({
        generateStructured: mockGenerate,
      });

      const result = await service.getExchangeRate('test-user-id', {
        from: 'USD',
        to: 'VND',
        amount: 10,
      });

      expect(mockGenerate).toHaveBeenCalled();
      expect(result.data.from).toBe('USD');
      expect(result.data.to).toBe('VND');
      expect(result.data.rate).toBe(25400);
      expect(result.data.amount).toBe(10);
      expect(result.data.convertedAmount).toBe(254000);
      expect(result.data.formattedRate).toContain('1 USD = 25,400 VND');
      expect(result.data.note).toBe('Tỷ giá tham khảo Vietcombank');
      expect(result.meta.provider).toBe('gemini');
      expect(result.meta.usage.totalTokens).toBe(53);
    });
  });
});
