import { SavingsCalculatorEngine } from '../src/modules/savings/services/savings-calculator.engine';

describe('SavingsCalculatorEngine (Thông tư 14/2017/TT-NHNN)', () => {
  describe('calculateMaturityDate', () => {
    it('correctly clamps maturity date to end of month', () => {
      // 2026 không phải năm nhuận, tháng 2 có 28 ngày
      const maturity1 = SavingsCalculatorEngine.calculateMaturityDate('2026-01-31', 1);
      expect(maturity1).toBe('2026-02-28');

      const maturity2 = SavingsCalculatorEngine.calculateMaturityDate('2026-03-31', 1);
      expect(maturity2).toBe('2026-04-30');

      const maturity3 = SavingsCalculatorEngine.calculateMaturityDate('2026-01-15', 6);
      expect(maturity3).toBe('2026-07-15');

      const maturity4 = SavingsCalculatorEngine.calculateMaturityDate('2026-01-15', 12);
      expect(maturity4).toBe('2027-01-15');
    });
  });

  describe('calculateActualDays', () => {
    it('calculates exact actual days between calendar dates', () => {
      // Từ 2026-01-15 đến 2026-07-15:
      // Tháng 1: 16 ngày (31 - 15)
      // Tháng 2: 28 ngày
      // Tháng 3: 31 ngày
      // Tháng 4: 30 ngày
      // Tháng 5: 31 ngày
      // Tháng 6: 30 ngày
      // Tháng 7: 15 ngày
      // Tổng = 16 + 28 + 31 + 30 + 31 + 30 + 15 = 181 ngày
      const days = SavingsCalculatorEngine.calculateActualDays('2026-01-15', '2026-07-15');
      expect(days).toBe(181);
    });

    it('returns 0 if maturityDate is before or equal to startDate', () => {
      expect(SavingsCalculatorEngine.calculateActualDays('2026-05-10', '2026-05-10')).toBe(0);
      expect(SavingsCalculatorEngine.calculateActualDays('2026-05-10', '2026-05-01')).toBe(0);
    });
  });

  describe('calculateTermInterest', () => {
    it('calculates interest accurately based on 365-day denominator', () => {
      // Gốc: 100,000,000 VND
      // Lãi suất: 5.5% / năm
      // Số ngày thực tế: 181 ngày
      // Tiền lãi = (100,000,000 * 0.055 * 181) / 365 = 2,727,397.26027... -> 2727397.26
      const interest = SavingsCalculatorEngine.calculateTermInterest(100000000, 5.5, 181);
      expect(interest.toFixed(2)).toBe('2727397.26');
    });

    it('handles 1 full year 365 days accurately', () => {
      // 100M VND, 6.0% / năm, 365 ngày = đúng 6,000,000 VND
      const interest = SavingsCalculatorEngine.calculateTermInterest(100000000, 6.0, 365);
      expect(interest.toFixed(2)).toBe('6000000.00');
    });

    it('returns 0 for negative or zero inputs', () => {
      expect(SavingsCalculatorEngine.calculateTermInterest(0, 5.5, 181).toFixed(2)).toBe('0.00');
      expect(SavingsCalculatorEngine.calculateTermInterest(-100, 5.5, 181).toFixed(2)).toBe('0.00');
      expect(SavingsCalculatorEngine.calculateTermInterest(1000000, -5, 181).toFixed(2)).toBe('0.00');
    });
  });

  describe('previewTermDeposit', () => {
    it('returns comprehensive preview payload', () => {
      const preview = SavingsCalculatorEngine.previewTermDeposit(50000000, 5.0, 6, '2026-01-01');
      expect(preview.principalAmount).toBe('50000000.00');
      expect(preview.interestRate).toBe('5.00');
      expect(preview.termMonths).toBe(6);
      expect(preview.startDate).toBe('2026-01-01');
      expect(preview.maturityDate).toBe('2026-07-01');
      expect(preview.actualDays).toBe(181);

      // (50M * 0.05 * 181) / 365 = 1,239,726.03
      expect(preview.estimatedInterest).toBe('1239726.03');
      expect(preview.totalAtMaturity).toBe('51239726.03');
    });
  });

  describe('calculateAccruedInterest', () => {
    it('computes accrued interest and progress to current date', () => {
      // Start: 2026-01-01, Maturity: 2026-07-01 (181 days total)
      // Current: 2026-04-01 (90 days elapsed)
      const accrued = SavingsCalculatorEngine.calculateAccruedInterest(
        100000000,
        6.0,
        '2026-01-01',
        '2026-07-01',
        '2026-04-01',
      );

      expect(accrued.totalDays).toBe(181);
      expect(accrued.elapsedDays).toBe(90);
      expect(accrued.remainingDays).toBe(91);
      expect(accrued.progressPercentage).toBe(49.72);

      // Lãi 90 ngày: (100M * 0.06 * 90) / 365 = 1,479,452.05
      expect(accrued.accruedInterest).toBe('1479452.05');
    });
  });

  describe('calculateEarlyWithdrawal (Thông tư 04/2022/TT-NHNN)', () => {
    it('calculates non-term interest and computes interest lost by breaking term early', () => {
      // 100M, 6.0% kỳ hạn 6 tháng (181 ngày), rút vào ngày thứ 90 với lãi KKH 0.2%
      const early = SavingsCalculatorEngine.calculateEarlyWithdrawal(
        100000000,
        6.0,
        0.2,
        '2026-01-01',
        '2026-07-01',
        '2026-04-01',
      );

      expect(early.actualDays).toBe(90);
      // Lãi dự kiến cả kỳ: (100M * 0.06 * 181) / 365 = 2,975,342.47
      expect(early.estimatedTermInterest).toBe('2975342.47');
      // Lãi KKH thực nhận: (100M * 0.002 * 90) / 365 = 49,315.07
      expect(early.actualInterestReceived).toBe('49315.07');
      // Lãi mất = 2,975,342.47 - 49,315.07 = 2,926,027.40
      expect(early.interestLost).toBe('2926027.40');
      // Tổng nhận: 100M + 49,315.07 = 100,049,315.07
      expect(early.totalReceived).toBe('100049315.07');
    });
  });
});
