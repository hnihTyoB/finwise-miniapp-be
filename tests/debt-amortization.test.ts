import {
  DebtAmortizationEngine,
  AmortizationScheduleInput,
} from '../src/modules/debts/services/debt-amortization.engine';

describe('DebtAmortizationEngine (Unit Tests)', () => {
  const baseInput: AmortizationScheduleInput = {
    principal: 120_000_000,
    annualInterestRate: 12, // 1% / month
    termMonths: 12,
    startDate: '2026-01-31',
  };

  describe('Method 1: REDUCING_BALANCE (Dư nợ giảm dần)', () => {
    it('should correctly calculate reducing balance schedule with exact principal preservation', () => {
      const result = DebtAmortizationEngine.calculate('REDUCING_BALANCE', baseInput);

      expect(result.method).toBe('REDUCING_BALANCE');
      expect(result.installments).toHaveLength(12);

      // Invariant 1: Total principal paid across all installments MUST equal original principal
      const sumPrincipal = result.installments.reduce((sum, item) => sum + item.principalDue, 0);
      expect(sumPrincipal).toBe(baseInput.principal);

      // Invariant 2: Final installment remaining principal must be 0
      expect(result.installments[11].remainingPrincipal).toBe(0);

      // Period 1: Gốc 10M, Lãi 120M * 1% = 1.2M, Total 11.2M
      expect(result.installments[0].principalDue).toBe(10_000_000);
      expect(result.installments[0].interestDue).toBe(1_200_000);
      expect(result.installments[0].totalDue).toBe(11_200_000);
      expect(result.installments[0].remainingPrincipal).toBe(110_000_000);

      // Dates should clamp properly for Jan 31 anchor
      expect(result.installments[0].dueDate).toBe('2026-02-28'); // 2026 is non-leap year
      expect(result.installments[1].dueDate).toBe('2026-03-31');
      expect(result.installments[2].dueDate).toBe('2026-04-30');

      // Total interest in reducing balance for 120M at 1%/mo for 12 mo:
      // (120 + 110 + 100 + 90 + 80 + 70 + 60 + 50 + 40 + 30 + 20 + 10) * 1% = 780 * 1% = 7.8M
      expect(result.summary.totalInterest).toBe(7_800_000);
      expect(result.summary.totalPayment).toBe(127_800_000);
    });

    it('should handle odd principal amounts with zero rounding residual', () => {
      const oddInput: AmortizationScheduleInput = {
        principal: 10_000_000,
        annualInterestRate: 10,
        termMonths: 3,
        startDate: '2026-05-15',
      };

      const result = DebtAmortizationEngine.calculate('REDUCING_BALANCE', oddInput);
      const sumPrincipal = result.installments.reduce((sum, item) => sum + item.principalDue, 0);
      expect(sumPrincipal).toBe(10_000_000);
      expect(result.installments[2].remainingPrincipal).toBe(0);
    });
  });

  describe('Method 2: FIXED_ANNUITY (Niên kim cố định / Trả góp đều)', () => {
    it('should calculate fixed annuity with equal periodic total payment and zero residual', () => {
      const result = DebtAmortizationEngine.calculate('FIXED_ANNUITY', baseInput);

      expect(result.method).toBe('FIXED_ANNUITY');
      expect(result.installments).toHaveLength(12);

      // Invariant 1: Total principal paid across all installments MUST equal original principal
      const sumPrincipal = result.installments.reduce((sum, item) => sum + item.principalDue, 0);
      expect(sumPrincipal).toBe(baseInput.principal);

      // Invariant 2: Final installment remaining principal must be 0
      expect(result.installments[11].remainingPrincipal).toBe(0);

      // In annuity, totalDue of periods 1..N-1 is almost constant (subject to integer rounding)
      const firstPayment = result.installments[0].totalDue;
      const secondPayment = result.installments[1].totalDue;
      expect(Math.abs(firstPayment - secondPayment)).toBeLessThanOrEqual(2);

      // Principal should increase over time while interest decreases
      expect(result.installments[0].principalDue).toBeLessThan(result.installments[11].principalDue);
      expect(result.installments[0].interestDue).toBeGreaterThan(result.installments[11].interestDue);
    });

    it('should handle 0% interest rate gracefully (equal principal division)', () => {
      const zeroRateInput: AmortizationScheduleInput = {
        principal: 60_000_000,
        annualInterestRate: 0,
        termMonths: 6,
        startDate: '2026-06-01',
      };

      const result = DebtAmortizationEngine.calculate('FIXED_ANNUITY', zeroRateInput);
      expect(result.summary.totalInterest).toBe(0);
      expect(result.summary.totalPayment).toBe(60_000_000);
      expect(result.installments[0].principalDue).toBe(10_000_000);
      expect(result.installments[0].interestDue).toBe(0);
      expect(result.installments[5].remainingPrincipal).toBe(0);
    });
  });

  describe('Method 3: INTEREST_ONLY (Trả lãi định kỳ, gốc cuối kỳ)', () => {
    it('should keep principal intact until final installment', () => {
      const result = DebtAmortizationEngine.calculate('INTEREST_ONLY', baseInput);

      expect(result.method).toBe('INTEREST_ONLY');
      expect(result.installments).toHaveLength(12);

      // Periods 1..11: 0 principal, constant interest
      for (let i = 0; i < 11; i += 1) {
        expect(result.installments[i].principalDue).toBe(0);
        expect(result.installments[i].interestDue).toBe(1_200_000);
        expect(result.installments[i].remainingPrincipal).toBe(120_000_000);
      }

      // Period 12: Principal 120M, Interest 1.2M, Total 121.2M, remaining 0
      expect(result.installments[11].principalDue).toBe(120_000_000);
      expect(result.installments[11].interestDue).toBe(1_200_000);
      expect(result.installments[11].totalDue).toBe(121_200_000);
      expect(result.installments[11].remainingPrincipal).toBe(0);

      // Total interest: 1.2M * 12 = 14.4M
      expect(result.summary.totalInterest).toBe(14_400_000);
      expect(result.summary.totalPayment).toBe(134_400_000);
    });
  });

  describe('Validation & Edge Cases', () => {
    it('should throw error on non-positive principal', () => {
      expect(() =>
        DebtAmortizationEngine.calculate('REDUCING_BALANCE', {
          ...baseInput,
          principal: 0,
        }),
      ).toThrow('Principal must be a positive number');
    });

    it('should throw error on negative interest rate', () => {
      expect(() =>
        DebtAmortizationEngine.calculate('FIXED_ANNUITY', {
          ...baseInput,
          annualInterestRate: -5,
        }),
      ).toThrow('Annual interest rate must be a non-negative number');
    });

    it('should throw error on invalid term months', () => {
      expect(() =>
        DebtAmortizationEngine.calculate('INTEREST_ONLY', {
          ...baseInput,
          termMonths: 0,
        }),
      ).toThrow('Term months must be an integer >= 1');
    });
  });
});
