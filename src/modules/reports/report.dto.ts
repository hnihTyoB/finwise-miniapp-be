import { BudgetType, SavingGoalStatus, TransactionType } from '@prisma/client';

export type ReportPeriodPreset = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';
export type ReportGranularity = 'AUTO' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type ResolvedReportGranularity = Exclude<ReportGranularity, 'AUTO'>;
export type BudgetPerformanceStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'EXCEEDED';

export interface ReportQueryDto {
  period: ReportPeriodPreset;
  dateFrom?: Date;
  dateTo?: Date;
  walletId?: string;
  currency?: string;
  granularity: ReportGranularity;
}

export interface ReportPeriodDto {
  preset: ReportPeriodPreset;
  from: Date;
  to: Date;
  timeZone: 'Asia/Ho_Chi_Minh';
  generatedAt: Date;
}

export interface MoneyFlowDto {
  currency: string;
  income: string;
  expense: string;
  netCashFlow: string;
  transactionCount: number;
}

export interface FinancialMetricDto extends MoneyFlowDto {
  currentBalance: string;
  savingsRate: string | null;
  expenseToIncomeRatio: string | null;
}

export interface ReportWalletDto {
  id: string;
  name: string;
  currency: string;
  balance: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface BudgetTypeSummaryDto {
  currency: string;
  type: BudgetType;
  budgetCount: number;
  budgetAmount: string;
  spentAmount: string;
  remainingAmount: string;
  usagePercentage: string;
  onTrackCount: number;
  nearLimitCount: number;
  exceededCount: number;
}

export interface SavingGoalCurrencySummaryDto {
  currency: string;
  targetAmount: string;
  savedAmount: string;
  remainingAmount: string;
  contributedInPeriod: string;
  progressPercentage: string;
}

export interface SavingGoalSummaryDto {
  totalGoals: number;
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  byCurrency: SavingGoalCurrencySummaryDto[];
}

export interface FinancialOverviewDto {
  period: ReportPeriodDto;
  metricsByCurrency: FinancialMetricDto[];
  wallets: {
    totalWallets: number;
    archivedWallets: number;
    items: ReportWalletDto[];
  };
  budgets: {
    totalBudgets: number;
    byType: BudgetTypeSummaryDto[];
  };
  savingGoals: SavingGoalSummaryDto;
}

export interface CashFlowBucketDto {
  from: Date;
  to: Date;
  metricsByCurrency: MoneyFlowDto[];
}

export interface CashFlowReportDto {
  period: ReportPeriodDto;
  granularity: ResolvedReportGranularity;
  totalsByCurrency: MoneyFlowDto[];
  series: CashFlowBucketDto[];
}

export interface SpendingCategoryDto {
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
  amount: string;
  percentage: string;
  transactionCount: number;
}

export interface SpendingCategoryCurrencyDto {
  currency: string;
  totalExpense: string;
  transactionCount: number;
  categories: SpendingCategoryDto[];
}

export interface SpendingCategoryReportDto {
  period: ReportPeriodDto;
  currencies: SpendingCategoryCurrencyDto[];
}

export interface BudgetPerformanceItemDto {
  id: string;
  name: string;
  type: BudgetType;
  currency: string;
  period: string;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
  budgetAmount: string;
  spentAmount: string;
  remainingAmount: string;
  usagePercentage: string;
  transactionCount: number;
  status: BudgetPerformanceStatus;
  reportFrom: Date;
  reportTo: Date;
  budgetFrom: Date;
  budgetTo: Date;
  isArchived: boolean;
}

export interface BudgetPerformanceReportDto {
  period: ReportPeriodDto;
  summary: {
    totalBudgets: number;
    byType: BudgetTypeSummaryDto[];
  };
  budgets: BudgetPerformanceItemDto[];
}

export interface ReportTransactionRecord {
  amount: import('@prisma/client').Prisma.Decimal;
  type: TransactionType;
  date: Date;
  wallet: {
    id: string;
    currency: string;
  };
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
}

export interface ReportSavingGoalRecord {
  id: string;
  targetAmount: import('@prisma/client').Prisma.Decimal;
  currency: string;
  status: SavingGoalStatus;
}
