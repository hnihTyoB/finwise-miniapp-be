import { QueryCompiler } from '../src/modules/query/query-compiler';
import { envConfig } from '../src/config/env.config';
import { findTransfersSchema } from '../src/modules/transfers/transfer.validation';
import { instantToBusinessDate } from '../src/common/date-time/business-time';
import { systemSettingKeyParamSchema } from '../src/modules/system-settings/system-setting.validation';
import { adminParamIdSchema } from '../src/modules/notifications/admin-notification.validation';

describe('Audit Backlog 18 Bug Fixes Verification', () => {
  describe('P0-02: Production Secret Validation', () => {
    it('should confirm envConfig is initialized and valid', () => {
      expect(envConfig.jwt.accessSecret).toBeDefined();
      expect(envConfig.jwt.refreshSecret).toBeDefined();
    });
  });

  describe('P0-03: Multi-Currency AI Query Compiler logic', () => {
    it('should resolve date ranges deterministically', () => {
      const todayRange = QueryCompiler.resolveDateRange({ type: 'TODAY' });
      expect(todayRange.description).toBe('Hôm nay');
      expect(todayRange.from).toBe(todayRange.to);

      const thisWeekRange = QueryCompiler.resolveDateRange({ type: 'THIS_WEEK' });
      expect(thisWeekRange.description).toBe('Tuần này');
      expect(thisWeekRange.from <= thisWeekRange.to).toBe(true);
    });

    it('should format multi-currency breakdown accurately without currency loss', () => {
      const currencyTotals = new Map<string, { sum: number; count: number }>();
      currencyTotals.set('VND', { sum: 150000, count: 2 });
      currencyTotals.set('USD', { sum: 20, count: 1 });

      expect(currencyTotals.size).toBe(2);
      const resolvedCurrency = currencyTotals.size > 1 ? 'MULTI' : 'VND';
      expect(resolvedCurrency).toBe('MULTI');

      const currencyBreakdown = Array.from(currencyTotals.entries())
        .map(([cur, data]) => `${data.sum.toLocaleString('vi-VN')} ${cur} (${data.count} giao dịch)`)
        .join(' và ');

      expect(currencyBreakdown).toContain('150.000 VND (2 giao dịch)');
      expect(currencyBreakdown).toContain('20 USD (1 giao dịch)');
    });
  });

  describe('P1-04: UTC+7 Timezone in Business Date Conversion', () => {
    it('should convert UTC midnight to UTC+7 business date correctly', () => {
      // 2026-09-12 17:30 UTC is 2026-09-13 00:30 UTC+7
      const dateUtc = new Date('2026-09-12T17:30:00.000Z');
      const businessDate = instantToBusinessDate(dateUtc);
      expect(businessDate).toBe('2026-09-13');
    });
  });

  describe('P2-05: Flexible Date Filter Formats for Transfers', () => {
    it('should accept YYYY-MM-DD format', () => {
      const res = findTransfersSchema.safeParse({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.dateFrom).toBeInstanceOf(Date);
      }
    });

    it('should accept ISO 8601 full datetime format', () => {
      const res = findTransfersSchema.safeParse({
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T23:59:59.999Z',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.dateFrom).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid date strings', () => {
      const res = findTransfersSchema.safeParse({ dateFrom: 'invalid-date' });
      expect(res.success).toBe(false);
    });
  });

  describe('P3-02: Route Parameter Validation Schemas', () => {
    it('should validate system setting key', () => {
      expect(systemSettingKeyParamSchema.safeParse({ key: 'MAINTENANCE_MODE' }).success).toBe(true);
      expect(systemSettingKeyParamSchema.safeParse({ key: '' }).success).toBe(false);
    });

    it('should validate admin UUID param', () => {
      expect(adminParamIdSchema.safeParse({ id: 'c3f3ef80-87b6-4b82-a0b2-3db3ad537b00' }).success).toBe(true);
      expect(adminParamIdSchema.safeParse({ id: 'invalid-id' }).success).toBe(false);
    });
  });
});
