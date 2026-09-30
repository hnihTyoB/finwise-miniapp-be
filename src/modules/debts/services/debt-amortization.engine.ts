import {
  addBusinessMonthsClamped,
  assertBusinessDate,
  BusinessDate,
} from '../../../common/date-time/business-time';

export type AmortizationMethod =
  | 'REDUCING_BALANCE'
  | 'FIXED_ANNUITY'
  | 'INTEREST_ONLY';

export interface AmortizationScheduleInput {
  principal: number;
  annualInterestRate: number; // Tỷ lệ %/năm (ví dụ 12 nghĩa là 12%/năm)
  termMonths: number; // Số tháng (>= 1)
  startDate: string; // YYYY-MM-DD
}

export interface AmortizationInstallment {
  period: number;
  dueDate: BusinessDate;
  principalDue: number; // Gốc phải trả kỳ này (VNĐ tròn)
  interestDue: number; // Lãi phải trả kỳ này (VNĐ tròn)
  totalDue: number; // Tổng phải trả = Gốc + Lãi
  remainingPrincipal: number; // Dư nợ gốc còn lại sau khi thanh toán kỳ này
}

export interface AmortizationScheduleResult {
  method: AmortizationMethod;
  summary: {
    principal: number;
    totalInterest: number;
    totalPayment: number;
    termMonths: number;
    annualInterestRate: number;
  };
  installments: AmortizationInstallment[];
}

/**
 * Động cơ tính toán bảng lịch trả nợ & khấu hao (Debt Amortization Pure Engine).
 * Đảm bảo:
 * 1. Không phụ thuộc I/O hoặc cơ sở dữ liệu.
 * 2. Bảo toàn tuyệt đối số tiền gốc: Tổng gốc các kỳ = Gốc ban đầu.
 * 3. Dư nợ kỳ cuối cùng luôn triệt tiêu về đúng 0 VNĐ (xử lý sai số làm tròn).
 * 4. Múi giờ và ngày đến hạn neo chuẩn xác theo lịch kinh doanh Việt Nam (Asia/Ho_Chi_Minh).
 */
export class DebtAmortizationEngine {
  /**
   * Tính toán bảng lịch trả nợ theo phương pháp yêu cầu.
   */
  public static calculate(
    method: AmortizationMethod,
    input: AmortizationScheduleInput,
  ): AmortizationScheduleResult {
    this.validateInput(input);

    switch (method) {
      case 'REDUCING_BALANCE':
        return this.calculateReducingBalance(input);
      case 'FIXED_ANNUITY':
        return this.calculateFixedAnnuity(input);
      case 'INTEREST_ONLY':
        return this.calculateInterestOnly(input);
      default:
        throw new Error(`Unsupported amortization method: ${method as string}`);
    }
  }

  private static validateInput(input: AmortizationScheduleInput): void {
    if (!Number.isFinite(input.principal) || input.principal <= 0) {
      throw new Error('Principal must be a positive number');
    }
    if (!Number.isFinite(input.annualInterestRate) || input.annualInterestRate < 0) {
      throw new Error('Annual interest rate must be a non-negative number');
    }
    if (!Number.isInteger(input.termMonths) || input.termMonths < 1) {
      throw new Error('Term months must be an integer >= 1');
    }
    assertBusinessDate(input.startDate);
  }

  /**
   * Phương pháp 1: Dư nợ giảm dần (Reducing Balance)
   * - Gốc mỗi kỳ = Gốc ban đầu / Số tháng (làm tròn số).
   * - Lãi mỗi kỳ = Dư nợ đầu kỳ * Lãi suất tháng.
   * - Kỳ cuối cùng: Gốc = Toàn bộ dư nợ còn lại để đảm bảo sạch nợ về 0.
   */
  private static calculateReducingBalance(
    input: AmortizationScheduleInput,
  ): AmortizationScheduleResult {
    const { principal, annualInterestRate, termMonths, startDate } = input;
    const monthlyRate = (annualInterestRate / 100) / 12;
    const basePrincipalPerPeriod = Math.round(principal / termMonths);

    const installments: AmortizationInstallment[] = [];
    let currentBalance = principal;
    let totalInterest = 0;
    let totalPrincipalPaid = 0;

    for (let period = 1; period <= termMonths; period += 1) {
      const dueDate = addBusinessMonthsClamped(startDate, period);
      const interestDue = Math.round(currentBalance * monthlyRate);

      let principalDue: number;
      if (period === termMonths) {
        // Kỳ cuối cùng nhận trọn phần dư nợ gốc còn lại
        principalDue = currentBalance;
      } else {
        principalDue = Math.min(basePrincipalPerPeriod, currentBalance);
      }

      currentBalance -= principalDue;
      totalPrincipalPaid += principalDue;
      totalInterest += interestDue;

      installments.push({
        period,
        dueDate,
        principalDue,
        interestDue,
        totalDue: principalDue + interestDue,
        remainingPrincipal: Math.max(0, currentBalance),
      });
    }

    return {
      method: 'REDUCING_BALANCE',
      summary: {
        principal,
        totalInterest,
        totalPayment: totalPrincipalPaid + totalInterest,
        termMonths,
        annualInterestRate,
      },
      installments,
    };
  }

  /**
   * Phương pháp 2: Niên kim cố định / Trả góp đều (Fixed Annuity)
   * - Tổng số tiền mỗi kỳ A = P * [r(1+r)^N] / [(1+r)^N - 1]
   * - Lãi kỳ = Dư nợ đầu kỳ * r
   * - Gốc kỳ = A - Lãi kỳ
   * - Kỳ cuối cùng: Gốc = Toàn bộ dư nợ còn lại, dư nợ về 0.
   */
  private static calculateFixedAnnuity(
    input: AmortizationScheduleInput,
  ): AmortizationScheduleResult {
    const { principal, annualInterestRate, termMonths, startDate } = input;
    const monthlyRate = (annualInterestRate / 100) / 12;

    let fixedMonthlyPayment: number;
    if (monthlyRate === 0) {
      fixedMonthlyPayment = Math.round(principal / termMonths);
    } else {
      const factor = Math.pow(1 + monthlyRate, termMonths);
      fixedMonthlyPayment = Math.round(
        principal * ((monthlyRate * factor) / (factor - 1)),
      );
    }

    const installments: AmortizationInstallment[] = [];
    let currentBalance = principal;
    let totalInterest = 0;
    let totalPrincipalPaid = 0;

    for (let period = 1; period <= termMonths; period += 1) {
      const dueDate = addBusinessMonthsClamped(startDate, period);
      const interestDue = Math.round(currentBalance * monthlyRate);

      let principalDue: number;
      if (period === termMonths) {
        // Kỳ cuối cùng nhận trọn phần dư nợ gốc còn lại để triệt tiêu sai số làm tròn
        principalDue = currentBalance;
      } else {
        principalDue = Math.min(
          Math.max(0, fixedMonthlyPayment - interestDue),
          currentBalance,
        );
      }

      currentBalance -= principalDue;
      totalPrincipalPaid += principalDue;
      totalInterest += interestDue;

      installments.push({
        period,
        dueDate,
        principalDue,
        interestDue,
        totalDue: principalDue + interestDue,
        remainingPrincipal: Math.max(0, currentBalance),
      });
    }

    return {
      method: 'FIXED_ANNUITY',
      summary: {
        principal,
        totalInterest,
        totalPayment: totalPrincipalPaid + totalInterest,
        termMonths,
        annualInterestRate,
      },
      installments,
    };
  }

  /**
   * Phương pháp 3: Trả lãi định kỳ, gốc cuối kỳ (Interest-Only)
   * - Các kỳ 1 đến N-1: Gốc = 0, Lãi = Gốc ban đầu * r.
   * - Kỳ cuối cùng N: Gốc = Gốc ban đầu, Lãi = Gốc ban đầu * r.
   */
  private static calculateInterestOnly(
    input: AmortizationScheduleInput,
  ): AmortizationScheduleResult {
    const { principal, annualInterestRate, termMonths, startDate } = input;
    const monthlyRate = (annualInterestRate / 100) / 12;
    const regularInterest = Math.round(principal * monthlyRate);

    const installments: AmortizationInstallment[] = [];
    let totalInterest = 0;

    for (let period = 1; period <= termMonths; period += 1) {
      const dueDate = addBusinessMonthsClamped(startDate, period);
      const isFinalPeriod = period === termMonths;

      const principalDue = isFinalPeriod ? principal : 0;
      const interestDue = regularInterest;
      const remainingPrincipal = isFinalPeriod ? 0 : principal;

      totalInterest += interestDue;

      installments.push({
        period,
        dueDate,
        principalDue,
        interestDue,
        totalDue: principalDue + interestDue,
        remainingPrincipal,
      });
    }

    return {
      method: 'INTEREST_ONLY',
      summary: {
        principal,
        totalInterest,
        totalPayment: principal + totalInterest,
        termMonths,
        annualInterestRate,
      },
      installments,
    };
  }
}
