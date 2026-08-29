export type DataSufficiency = 'INSUFFICIENT' | 'SPARSE' | 'ROBUST';

export type BudgetRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ForecastQueryDto {
  walletId?: string;
  currency?: string;
  horizonDays?: number;
}

export interface ForecastSeriesPointDto {
  date: string;
  dayIndex: number;
  projectedBalance: string;
  lowerBound95: string;
  upperBound95: string;
}

export interface ForecastMetricsDto {
  averageDailyIncome: string;
  weightedDailyExpense: string;
  netDailyBurnRate: string;
  projectedEndBalance: string;
  runwayDays: number | null;
  depletionDate: string | null;
  isDepletionProjected: boolean;
}

export interface ForecastRunwayDto {
  currency: string;
  walletId: string | null;
  currentBalance: string;
  horizonDays: number;
  dataSufficiency: DataSufficiency;
  historicalDaysAnalyzed: number;
  historicalTransactionCount: number;
  metrics: ForecastMetricsDto;
  series: ForecastSeriesPointDto[];
}

export interface BudgetDepletionItemDto {
  budgetId: string;
  budgetName: string;
  categoryName: string | null;
  currency: string;
  budgetAmount: string;
  spentAmount: string;
  remainingAmount: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  currentDailyBurn: string;
  recommendedDailySpend: string;
  projectedTotalSpend: string;
  projectedExhaustionDate: string | null;
  isExhaustionProjected: boolean;
  daysEarly: number | null;
  riskLevel: BudgetRiskLevel;
}

export interface BudgetDepletionReportDto {
  asOfDate: string;
  currency: string | null;
  items: BudgetDepletionItemDto[];
}
