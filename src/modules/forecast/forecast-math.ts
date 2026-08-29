import { Prisma } from '@prisma/client';
import { addBusinessDays, BusinessDate } from '../../common/date-time/business-time';
import {
  BudgetDepletionItemDto,
  BudgetRiskLevel,
  DataSufficiency,
  ForecastMetricsDto,
  ForecastSeriesPointDto,
} from './forecast.dto';

const LAMBDA_DECAY = 0.04; // Exponential weighting factor for recent days

export interface DailyBucket {
  date: BusinessDate;
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
}

export interface CategoryDailyBucket {
  categoryId: string;
  date: BusinessDate;
  amount: Prisma.Decimal;
}

export interface BudgetForecastInput {
  id: string;
  name: string;
  categoryName: string | null;
  currency: string;
  amount: Prisma.Decimal;
  spentAmount: Prisma.Decimal;
  startDate: BusinessDate;
  endDate: BusinessDate;
  alertThreshold: Prisma.Decimal;
}

export class ForecastMathEngine {
  /**
   * Evaluates data sufficiency based on transaction count and historical span.
   */
  static assessDataSufficiency(
    transactionCount: number,
    distinctDaysWithData: number,
  ): DataSufficiency {
    if (transactionCount < 5 || distinctDaysWithData < 5) {
      return 'INSUFFICIENT';
    }
    if (distinctDaysWithData < 25) {
      return 'SPARSE';
    }
    return 'ROBUST';
  }

  /**
   * Calculates weighted daily burn velocity, income, variance, and projects future runway.
   */
  static computeRunway(
    currentBalance: Prisma.Decimal,
    dailyBuckets: DailyBucket[],
    horizonDays: number,
    asOfDate: BusinessDate,
    totalTransactionCount: number,
  ): {
    metrics: ForecastMetricsDto;
    series: ForecastSeriesPointDto[];
    dataSufficiency: DataSufficiency;
  } {
    const dataSufficiency = this.assessDataSufficiency(
      totalTransactionCount,
      dailyBuckets.length,
    );

    if (dailyBuckets.length === 0 || currentBalance.isNegative()) {
      const series = this.generateFlatSeries(currentBalance, horizonDays, asOfDate);
      return {
        dataSufficiency,
        metrics: {
          averageDailyIncome: '0.00',
          weightedDailyExpense: '0.00',
          netDailyBurnRate: '0.00',
          projectedEndBalance: currentBalance.toFixed(2),
          runwayDays: currentBalance.lessThanOrEqualTo(0) ? 0 : null,
          depletionDate: currentBalance.lessThanOrEqualTo(0) ? asOfDate : null,
          isDepletionProjected: currentBalance.lessThanOrEqualTo(0),
        },
        series,
      };
    }

    // Sort buckets chronologically
    const sortedBuckets = [...dailyBuckets].sort((a, b) => a.date.localeCompare(b.date));
    const totalDays = sortedBuckets.length;

    let sumWeightedExpense = 0;
    let sumWeights = 0;
    let sumIncome = 0;

    sortedBuckets.forEach((bucket, index) => {
      // Days from the latest data point (0 for newest, totalDays-1 for oldest)
      const age = totalDays - 1 - index;
      const weight = Math.exp(-LAMBDA_DECAY * age);

      const exp = bucket.expense.toNumber();
      sumWeightedExpense += exp * weight;
      sumWeights += weight;
      sumIncome += bucket.income.toNumber();
    });

    const weightedDailyExpense = sumWeights > 0 ? sumWeightedExpense / sumWeights : 0;
    const averageDailyIncome = totalDays > 0 ? sumIncome / totalDays : 0;
    const netDailyFlow = averageDailyIncome - weightedDailyExpense;

    // Calculate sample standard deviation of daily expenses for confidence intervals
    let sumSquaredDiff = 0;
    sortedBuckets.forEach((bucket) => {
      const diff = bucket.expense.toNumber() - weightedDailyExpense;
      sumSquaredDiff += diff * diff;
    });
    const sampleVariance = totalDays > 1 ? sumSquaredDiff / (totalDays - 1) : 0;
    const sampleStdDev = Math.sqrt(sampleVariance);

    // Calculate depletion date
    let runwayDays: number | null = null;
    let depletionDate: string | null = null;
    let isDepletionProjected = false;

    if (netDailyFlow < 0 && currentBalance.greaterThan(0)) {
      const burnRatePerDay = Math.abs(netDailyFlow);
      const daysToZero = Math.floor(currentBalance.toNumber() / burnRatePerDay);
      runwayDays = daysToZero;
      depletionDate = addBusinessDays(asOfDate, daysToZero);
      isDepletionProjected = true;
    } else if (currentBalance.lessThanOrEqualTo(0)) {
      runwayDays = 0;
      depletionDate = asOfDate;
      isDepletionProjected = true;
    }

    // Generate projected forward series with 95% confidence bounds
    const series: ForecastSeriesPointDto[] = [];
    const initialBalanceNum = currentBalance.toNumber();

    for (let h = 1; h <= horizonDays; h++) {
      const futureDate = addBusinessDays(asOfDate, h);
      const projectedPoint = initialBalanceNum + h * netDailyFlow;
      const standardError = sampleStdDev * Math.sqrt(h);
      const margin = 1.96 * standardError;

      series.push({
        date: futureDate,
        dayIndex: h,
        projectedBalance: projectedPoint.toFixed(2),
        lowerBound95: (projectedPoint - margin).toFixed(2),
        upperBound95: (projectedPoint + margin).toFixed(2),
      });
    }

    const projectedEndBalance = series.length > 0
      ? series[series.length - 1].projectedBalance
      : currentBalance.toFixed(2);

    return {
      dataSufficiency,
      metrics: {
        averageDailyIncome: averageDailyIncome.toFixed(2),
        weightedDailyExpense: weightedDailyExpense.toFixed(2),
        netDailyBurnRate: netDailyFlow.toFixed(2),
        projectedEndBalance,
        runwayDays,
        depletionDate,
        isDepletionProjected,
      },
      series,
    };
  }

  /**
   * Computes budget depletion dates and risk assessments.
   */
  static computeBudgetDepletions(
    budgets: BudgetForecastInput[],
    asOfDate: BusinessDate,
  ): BudgetDepletionItemDto[] {
    return budgets.map((budget) => {
      const budgetAmountNum = budget.amount.toNumber();
      const spentAmountNum = budget.spentAmount.toNumber();
      const remainingAmountNum = Math.max(0, budgetAmountNum - spentAmountNum);

      const totalDays = Math.max(1, this.daysBetween(budget.startDate, budget.endDate) + 1);
      const daysElapsed = Math.min(
        totalDays,
        Math.max(1, this.daysBetween(budget.startDate, asOfDate) + 1),
      );
      const daysRemaining = Math.max(0, totalDays - daysElapsed);

      const currentDailyBurn = spentAmountNum / daysElapsed;
      const recommendedDailySpend = daysRemaining > 0
        ? remainingAmountNum / daysRemaining
        : 0;

      const projectedTotalSpend = spentAmountNum + daysRemaining * currentDailyBurn;

      let projectedExhaustionDate: string | null = null;
      let isExhaustionProjected = false;
      let daysEarly: number | null = null;

      if (spentAmountNum >= budgetAmountNum) {
        projectedExhaustionDate = asOfDate;
        isExhaustionProjected = true;
        daysEarly = daysRemaining;
      } else if (currentDailyBurn > 0 && remainingAmountNum > 0) {
        const daysToExhaust = Math.floor(remainingAmountNum / currentDailyBurn);
        if (daysToExhaust < daysRemaining) {
          projectedExhaustionDate = addBusinessDays(asOfDate, daysToExhaust);
          isExhaustionProjected = true;
          daysEarly = daysRemaining - daysToExhaust;
        }
      }

      // Risk level determination
      let riskLevel: BudgetRiskLevel = 'LOW';
      if (spentAmountNum >= budgetAmountNum || (daysEarly !== null && daysEarly > 5)) {
        riskLevel = 'CRITICAL';
      } else if (isExhaustionProjected) {
        riskLevel = 'HIGH';
      } else if (projectedTotalSpend > budgetAmountNum * 0.85) {
        riskLevel = 'MEDIUM';
      }

      return {
        budgetId: budget.id,
        budgetName: budget.name,
        categoryName: budget.categoryName,
        currency: budget.currency,
        budgetAmount: budget.amount.toFixed(2),
        spentAmount: budget.spentAmount.toFixed(2),
        remainingAmount: remainingAmountNum.toFixed(2),
        startDate: budget.startDate,
        endDate: budget.endDate,
        totalDays,
        daysElapsed,
        daysRemaining,
        currentDailyBurn: currentDailyBurn.toFixed(2),
        recommendedDailySpend: recommendedDailySpend.toFixed(2),
        projectedTotalSpend: projectedTotalSpend.toFixed(2),
        projectedExhaustionDate,
        isExhaustionProjected,
        daysEarly,
        riskLevel,
      };
    });
  }

  private static generateFlatSeries(
    balance: Prisma.Decimal,
    horizonDays: number,
    asOfDate: BusinessDate,
  ): ForecastSeriesPointDto[] {
    const series: ForecastSeriesPointDto[] = [];
    const formatted = balance.toFixed(2);
    for (let h = 1; h <= horizonDays; h++) {
      series.push({
        date: addBusinessDays(asOfDate, h),
        dayIndex: h,
        projectedBalance: formatted,
        lowerBound95: formatted,
        upperBound95: formatted,
      });
    }
    return series;
  }

  private static daysBetween(start: BusinessDate, end: BusinessDate): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const [y1, m1, d1] = start.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);
    const date1 = Date.UTC(y1, m1 - 1, d1);
    const date2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((date2 - date1) / msPerDay);
  }
}
