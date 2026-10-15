import { Prisma } from '@prisma/client';
import {
  addBusinessMonthsClamped,
  assertBusinessDate,
  businessDateToPrismaDate,
  BusinessDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../../common/date-time/business-time';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface SavingsCalculationPreview {
  principalAmount: string;
  interestRate: string;
  termMonths: number;
  startDate: BusinessDate;
  maturityDate: BusinessDate;
  actualDays: number;
  estimatedInterest: string;
  totalAtMaturity: string;
}

export interface EarlyWithdrawalCalculation {
  principalAmount: string;
  startDate: BusinessDate;
  withdrawalDate: BusinessDate;
  actualDays: number;
  nonTermRate: string;
  estimatedTermInterest: string;
  actualInterestReceived: string;
  interestLost: string;
  totalReceived: string;
}

export interface AccruedInterestCalculation {
  elapsedDays: number;
  totalDays: number;
  progressPercentage: number;
  accruedInterest: string;
  remainingDays: number;
}

export class SavingsCalculatorEngine {
  private static readonly DAYS_IN_YEAR = new Decimal(365);

  /**
   * Tính ngày đáo hạn chuẩn ngân hàng dựa trên ngày bắt đầu và số tháng kỳ hạn (clamped ngày cuối tháng)
   */
  public static calculateMaturityDate(startDate: string, termMonths: number): BusinessDate {
    const validStart = assertBusinessDate(startDate);
    return addBusinessMonthsClamped(validStart, termMonths);
  }

  /**
   * Tính số ngày gửi thực tế giữa 2 mốc ngày (theo quy tắc UTC+7 business dates)
   */
  public static calculateActualDays(startDate: string, maturityDate: string): number {
    const start = businessDateToPrismaDate(startDate);
    const end = businessDateToPrismaDate(maturityDate);
    const diffMs = end.getTime() - start.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  /**
   * Tính tiền lãi theo chuẩn Thông tư 14/2017/TT-NHNN:
   * Tiền lãi = (Số tiền gửi x Lãi suất x Số ngày thực tế) / 365
   */
  public static calculateTermInterest(
    principal: string | number | Decimal,
    annualInterestRatePercent: string | number | Decimal,
    actualDays: number,
  ): Decimal {
    const p = new Decimal(principal);
    const ratePercent = new Decimal(annualInterestRatePercent);
    const days = new Decimal(actualDays);

    if (p.isNegative() || ratePercent.isNegative() || days.isNegative()) {
      return new Decimal(0);
    }

    // Tiền lãi = (P * (Rate / 100) * days) / 365
    const interest = p
      .mul(ratePercent.div(100))
      .mul(days)
      .div(this.DAYS_IN_YEAR)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return interest;
  }

  /**
   * Tính toán toàn bộ thông số dự kiến khi mở sổ tiết kiệm
   */
  public static previewTermDeposit(
    principal: string | number,
    annualInterestRatePercent: string | number,
    termMonths: number,
    startDateStr?: string,
  ): SavingsCalculationPreview {
    const p = new Decimal(principal);
    const rate = new Decimal(annualInterestRatePercent);
    const startDate = startDateStr
      ? assertBusinessDate(startDateStr)
      : instantToBusinessDate(new Date());

    const maturityDate = this.calculateMaturityDate(startDate, termMonths);
    const actualDays = this.calculateActualDays(startDate, maturityDate);
    const estimatedInterest = this.calculateTermInterest(p, rate, actualDays);
    const totalAtMaturity = p.add(estimatedInterest);

    return {
      principalAmount: p.toFixed(2),
      interestRate: rate.toFixed(2),
      termMonths,
      startDate,
      maturityDate,
      actualDays,
      estimatedInterest: estimatedInterest.toFixed(2),
      totalAtMaturity: totalAtMaturity.toFixed(2),
    };
  }

  /**
   * Tính lãi tích lũy tạm tính theo thời gian thực (Accrued Interest to Date)
   */
  public static calculateAccruedInterest(
    principal: string | number,
    annualInterestRatePercent: string | number,
    startDate: string,
    maturityDate: string,
    currentDateStr?: string,
  ): AccruedInterestCalculation {
    const p = new Decimal(principal);
    const rate = new Decimal(annualInterestRatePercent);
    const current = currentDateStr
      ? assertBusinessDate(currentDateStr)
      : instantToBusinessDate(new Date());

    const totalDays = this.calculateActualDays(startDate, maturityDate);
    const startToCurrentDays = this.calculateActualDays(startDate, current);
    const elapsedDays = Math.min(totalDays, Math.max(0, startToCurrentDays));
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    const progressPercentage = totalDays > 0
      ? Math.min(100, Math.round((elapsedDays / totalDays) * 10000) / 100)
      : 100;

    const accruedInterest = this.calculateTermInterest(p, rate, elapsedDays);

    return {
      elapsedDays,
      totalDays,
      progressPercentage,
      accruedInterest: accruedInterest.toFixed(2),
      remainingDays,
    };
  }

  /**
   * Tính toán khi rút trước hạn (Early Withdrawal) theo Thông tư 04/2022/TT-NHNN:
   * Áp dụng lãi suất không kỳ hạn cho toàn bộ thời gian thực gửi
   */
  public static calculateEarlyWithdrawal(
    principal: string | number,
    termInterestRate: string | number,
    nonTermRatePercent: string | number,
    startDate: string,
    maturityDate: string,
    withdrawalDateStr?: string,
  ): EarlyWithdrawalCalculation {
    const p = new Decimal(principal);
    const termRate = new Decimal(termInterestRate);
    const nonTermRate = new Decimal(nonTermRatePercent);

    const withdrawalDate = withdrawalDateStr
      ? assertBusinessDate(withdrawalDateStr)
      : instantToBusinessDate(new Date());

    const totalDays = this.calculateActualDays(startDate, maturityDate);
    const actualDays = Math.min(totalDays, this.calculateActualDays(startDate, withdrawalDate));

    // Lãi dự kiến đúng hạn
    const estimatedTermInterest = this.calculateTermInterest(p, termRate, totalDays);

    // Lãi thực nhận với lãi suất không kỳ hạn
    const actualInterestReceived = this.calculateTermInterest(p, nonTermRate, actualDays);

    // Lãi bị mất
    const interestLost = Decimal.max(0, estimatedTermInterest.sub(actualInterestReceived));
    const totalReceived = p.add(actualInterestReceived);

    return {
      principalAmount: p.toFixed(2),
      startDate: assertBusinessDate(startDate),
      withdrawalDate,
      actualDays,
      nonTermRate: nonTermRate.toFixed(2),
      estimatedTermInterest: estimatedTermInterest.toFixed(2),
      actualInterestReceived: actualInterestReceived.toFixed(2),
      interestLost: interestLost.toFixed(2),
      totalReceived: totalReceived.toFixed(2),
    };
  }
}
