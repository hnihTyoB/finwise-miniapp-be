import {
  BudgetType,
  Prisma,
  SavingGoalStatus,
  TransactionType,
} from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import {
  BudgetPerformanceItemDto,
  BudgetPerformanceReportDto,
  BudgetPerformanceStatus,
  BudgetTypeSummaryDto,
  CashFlowReportDto,
  FinancialOverviewDto,
  MoneyFlowDto,
  ReportGranularity,
  ReportPeriodDto,
  ReportQueryDto,
  ReportSavingGoalRecord,
  ReportTransactionRecord,
  ResolvedReportGranularity,
  SavingGoalSummaryDto,
  SpendingCategoryReportDto,
} from './report.dto';
import {
  ContributionSummary,
  ReportBudgetRecord,
  ReportRepository,
  ReportWalletRecord,
} from './report.repository';

import { cacheService } from '../../common/services/cache.service';
import {
  BUSINESS_TIME_ZONE,
  addBusinessDays,
  businessWallTimeToInstant,
  instantToBusinessDate,
  prismaDateToBusinessDate,
  timeZoneOffsetMinutesAt,
} from '../../common/date-time/business-time';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_DAYS = 5 * 366;
const MAX_SERIES_POINTS = 400;
const ZERO = new Prisma.Decimal(0);

interface MutableMoneyFlow {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  transactionCount: number;
}

interface ResolvedScope {
  wallets: ReportWalletRecord[];
  currency?: string;
}

export class ReportService {
  private readonly repository = new ReportRepository();

  async getOverview(userId: string, query: ReportQueryDto): Promise<FinancialOverviewDto> {
    const cacheKey = `finwise:cache:reports:${userId}:overview:${JSON.stringify(query)}`;
    const cached = await cacheService.get<FinancialOverviewDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const period = this.resolvePeriod(query);
    const scope = await this.resolveScope(userId, query);
    const [transactions, budgets, goals] = await Promise.all([
      this.repository.findTransactions(
        userId,
        period.from,
        period.to,
        query.walletId,
        scope.currency,
      ),
      this.repository.findBudgets(userId, period.from, period.to, scope.currency),
      this.repository.findSavingGoals(userId, scope.currency),
    ]);
    const [lifetimeContributions, periodContributions] = await Promise.all([
      this.repository.findContributionSummaries(goals.map((goal) => goal.id)),
      this.repository.findContributionSummaries(
        goals.map((goal) => goal.id),
        period.from,
        period.to,
      ),
    ]);
    const knownCurrencies = this.getKnownCurrencies(scope.wallets, transactions, scope.currency);
    const flows = this.toMoneyFlows(transactions, knownCurrencies);
    const currentBalances = this.sumWalletBalances(scope.wallets);

    const result = {
      period,
      metricsByCurrency: flows.map((flow) => {
        const income = new Prisma.Decimal(flow.income);
        const expense = new Prisma.Decimal(flow.expense);
        const netCashFlow = income.minus(expense);

        return {
          ...flow,
          currentBalance: (currentBalances.get(flow.currency) ?? ZERO).toFixed(2),
          savingsRate: income.isZero()
            ? null
            : netCashFlow.dividedBy(income).times(100).toFixed(2),
          expenseToIncomeRatio: income.isZero()
            ? null
            : expense.dividedBy(income).times(100).toFixed(2),
        };
      }),
      wallets: {
        totalWallets: scope.wallets.length,
        archivedWallets: scope.wallets.filter((wallet) => wallet.isArchived).length,
        items: scope.wallets.map((wallet) => ({
          ...wallet,
          balance: wallet.balance.toFixed(2),
        })),
      },
      budgets: this.buildBudgetSummary(budgets, transactions, period),
      savingGoals: this.buildSavingGoalSummary(
        goals,
        lifetimeContributions,
        periodContributions,
      ),
    };

    await cacheService.set(cacheKey, result, 300); // Cache for 5 minutes
    return result;
  }

  async getCashFlow(userId: string, query: ReportQueryDto): Promise<CashFlowReportDto> {
    const cacheKey = `finwise:cache:reports:${userId}:cashflow:${JSON.stringify(query)}`;
    const cached = await cacheService.get<CashFlowReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const period = this.resolvePeriod(query);
    const scope = await this.resolveScope(userId, query);
    const transactions = await this.repository.findTransactions(
      userId,
      period.from,
      period.to,
      query.walletId,
      scope.currency,
    );
    const knownCurrencies = this.getKnownCurrencies(scope.wallets, transactions, scope.currency);
    const granularity = this.resolveGranularity(query.granularity, period);
    const buckets = this.createBuckets(period, granularity);
    const transactionsByBucket = new Map<number, ReportTransactionRecord[]>();

    transactions.forEach((transaction) => {
      const key = this.getBucketStart(
        transaction.date,
        granularity,
        timeZoneOffsetMinutesAt(period.from),
      ).getTime();
      const bucket = transactionsByBucket.get(key) ?? [];
      bucket.push(transaction);
      transactionsByBucket.set(key, bucket);
    });

    const result = {
      period,
      granularity,
      totalsByCurrency: this.toMoneyFlows(transactions, knownCurrencies),
      series: buckets.map((bucket) => ({
        from: bucket.reportFrom,
        to: bucket.reportTo,
        metricsByCurrency: this.toMoneyFlows(
          transactionsByBucket.get(bucket.key) ?? [],
          knownCurrencies,
        ),
      })),
    };

    await cacheService.set(cacheKey, result, 300); // Cache for 5 minutes
    return result;
  }

  async getSpendingByCategory(
    userId: string,
    query: ReportQueryDto,
  ): Promise<SpendingCategoryReportDto> {
    const cacheKey = `finwise:cache:reports:${userId}:spending-category:${JSON.stringify(query)}`;
    const cached = await cacheService.get<SpendingCategoryReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const period = this.resolvePeriod(query);
    const scope = await this.resolveScope(userId, query);
    const transactions = await this.repository.findTransactions(
      userId,
      period.from,
      period.to,
      query.walletId,
      scope.currency,
    );
    const expenses = transactions.filter(
      (transaction) => transaction.type === TransactionType.EXPENSE,
    );
    const currencies = this.getKnownCurrencies(scope.wallets, expenses, scope.currency);

    const result = {
      period,
      currencies: currencies.map((currency) => {
        const currencyExpenses = expenses.filter(
          (transaction) => transaction.wallet.currency === currency,
        );
        const totalExpense = currencyExpenses.reduce(
          (total, transaction) => total.plus(transaction.amount),
          ZERO,
        );
        const categoryMap = new Map<
          string,
          { transaction: ReportTransactionRecord; amount: Prisma.Decimal; count: number }
        >();

        currencyExpenses.forEach((transaction) => {
          const current = categoryMap.get(transaction.category.id);
          categoryMap.set(transaction.category.id, {
            transaction,
            amount: (current?.amount ?? ZERO).plus(transaction.amount),
            count: (current?.count ?? 0) + 1,
          });
        });

        const categories = Array.from(categoryMap.values())
          .sort((left, right) => right.amount.comparedTo(left.amount))
          .map((entry) => ({
            category: entry.transaction.category,
            amount: entry.amount.toFixed(2),
            percentage: totalExpense.isZero()
              ? '0.00'
              : entry.amount.dividedBy(totalExpense).times(100).toFixed(2),
            transactionCount: entry.count,
          }));

        return {
          currency,
          totalExpense: totalExpense.toFixed(2),
          transactionCount: currencyExpenses.length,
          categories,
        };
      }),
    };

    await cacheService.set(cacheKey, result, 300); // Cache for 5 minutes
    return result;
  }

  async getBudgetPerformance(
    userId: string,
    query: ReportQueryDto,
  ): Promise<BudgetPerformanceReportDto> {
    const cacheKey = `finwise:cache:reports:${userId}:budget-performance:${JSON.stringify(query)}`;
    const cached = await cacheService.get<BudgetPerformanceReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const period = this.resolvePeriod(query);
    const scope = await this.resolveScope(userId, query);
    const [transactions, budgets] = await Promise.all([
      this.repository.findTransactions(
        userId,
        period.from,
        period.to,
        query.walletId,
        scope.currency,
      ),
      this.repository.findBudgets(userId, period.from, period.to, scope.currency),
    ]);

    const result = {
      period,
      summary: this.buildBudgetSummary(budgets, transactions, period),
      budgets: this.buildBudgetItems(budgets, transactions, period),
    };

    await cacheService.set(cacheKey, result, 300); // Cache for 5 minutes
    return result;
  }

  private async resolveScope(userId: string, query: ReportQueryDto): Promise<ResolvedScope> {
    let selectedCurrency = query.currency;

    if (query.walletId) {
      const wallet = await this.repository.findWalletById(userId, query.walletId);
      if (!wallet) {
        throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
      }
      if (selectedCurrency && wallet.currency !== selectedCurrency) {
        throw new AppError(
          'The selected wallet does not use the requested currency',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }
      selectedCurrency = wallet.currency;
    }

    const wallets = await this.repository.findWallets(
      userId,
      query.walletId,
      selectedCurrency,
    );

    return { wallets, currency: selectedCurrency };
  }

  private resolvePeriod(query: ReportQueryDto): ReportPeriodDto {
    const generatedAt = new Date();
    let from: Date;
    let to: Date;

    if (query.period === 'CUSTOM') {
      if (!query.dateFrom || !query.dateTo) {
        throw new AppError(
          'dateFrom and dateTo are required for a custom period',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }
      from = query.dateFrom;
      to = query.dateTo;
    } else {
      const today = instantToBusinessDate(generatedAt);
      const [year, monthNumber, day] = today.split('-').map(Number);
      const month = monthNumber - 1;
      const localNow = new Date(Date.UTC(year, month, day));
      let localFrom: Date;
      let localTo: Date;

      switch (query.period) {
        case 'DAY':
          localFrom = new Date(Date.UTC(year, month, day));
          localTo = new Date(localFrom.getTime() + MILLISECONDS_PER_DAY);
          break;
        case 'WEEK': {
          const dayOfWeek = localNow.getUTCDay();
          const daysSinceMonday = (dayOfWeek + 6) % 7;
          localFrom = new Date(Date.UTC(year, month, day - daysSinceMonday));
          localTo = new Date(localFrom.getTime() + 7 * MILLISECONDS_PER_DAY);
          break;
        }
        case 'YEAR':
          localFrom = new Date(Date.UTC(year, 0, 1));
          localTo = new Date(Date.UTC(year + 1, 0, 1));
          break;
        default:
          localFrom = new Date(Date.UTC(year, month, 1));
          localTo = new Date(Date.UTC(year, month + 1, 1));
      }

      const fromDate = localFrom.toISOString().slice(0, 10);
      const toDate = localTo.toISOString().slice(0, 10);
      from = businessWallTimeToInstant(fromDate);
      to = businessWallTimeToInstant(toDate);
    }

    if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_DAYS * MILLISECONDS_PER_DAY) {
      throw new AppError(
        `Report range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days`,
        422,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    return {
      preset: query.period,
      from,
      to,
      timeZone: BUSINESS_TIME_ZONE,
      generatedAt,
    };
  }

  private getKnownCurrencies(
    wallets: ReportWalletRecord[],
    transactions: ReportTransactionRecord[],
    requestedCurrency?: string,
  ) {
    const currencies = new Set<string>();
    if (requestedCurrency) {
      currencies.add(requestedCurrency);
    }
    wallets.forEach((wallet) => currencies.add(wallet.currency));
    transactions.forEach((transaction) => currencies.add(transaction.wallet.currency));
    return Array.from(currencies).sort();
  }

  private toMoneyFlows(
    transactions: ReportTransactionRecord[],
    knownCurrencies: string[],
  ): MoneyFlowDto[] {
    const flows = new Map<string, MutableMoneyFlow>();
    knownCurrencies.forEach((currency) => {
      flows.set(currency, { income: ZERO, expense: ZERO, transactionCount: 0 });
    });

    transactions.forEach((transaction) => {
      const currency = transaction.wallet.currency;
      const flow = flows.get(currency) ?? {
        income: ZERO,
        expense: ZERO,
        transactionCount: 0,
      };
      if (transaction.type === TransactionType.INCOME) {
        flow.income = flow.income.plus(transaction.amount);
      } else {
        flow.expense = flow.expense.plus(transaction.amount);
      }
      flow.transactionCount += 1;
      flows.set(currency, flow);
    });

    return Array.from(flows.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, flow]) => ({
        currency,
        income: flow.income.toFixed(2),
        expense: flow.expense.toFixed(2),
        netCashFlow: flow.income.minus(flow.expense).toFixed(2),
        transactionCount: flow.transactionCount,
      }));
  }

  private sumWalletBalances(wallets: ReportWalletRecord[]) {
    const balances = new Map<string, Prisma.Decimal>();
    wallets.forEach((wallet) => {
      balances.set(
        wallet.currency,
        (balances.get(wallet.currency) ?? ZERO).plus(wallet.balance),
      );
    });
    return balances;
  }

  private buildSavingGoalSummary(
    goals: ReportSavingGoalRecord[],
    lifetimeContributions: ContributionSummary[],
    periodContributions: ContributionSummary[],
  ): SavingGoalSummaryDto {
    const lifetimeByGoal = new Map(
      lifetimeContributions.map((summary) => [summary.savingGoalId, summary.amount]),
    );
    const periodByGoal = new Map(
      periodContributions.map((summary) => [summary.savingGoalId, summary.amount]),
    );
    const currencies = new Map<
      string,
      {
        target: Prisma.Decimal;
        saved: Prisma.Decimal;
        period: Prisma.Decimal;
      }
    >();

    goals.forEach((goal) => {
      const current = currencies.get(goal.currency) ?? {
        target: ZERO,
        saved: ZERO,
        period: ZERO,
      };
      current.target = current.target.plus(goal.targetAmount);
      current.saved = current.saved.plus(lifetimeByGoal.get(goal.id) ?? ZERO);
      current.period = current.period.plus(periodByGoal.get(goal.id) ?? ZERO);
      currencies.set(goal.currency, current);
    });

    return {
      totalGoals: goals.length,
      activeCount: goals.filter((goal) => goal.status === SavingGoalStatus.ACTIVE).length,
      pausedCount: goals.filter((goal) => goal.status === SavingGoalStatus.PAUSED).length,
      completedCount: goals.filter((goal) => goal.status === SavingGoalStatus.COMPLETED).length,
      byCurrency: Array.from(currencies.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, totals]) => ({
          currency,
          targetAmount: totals.target.toFixed(2),
          savedAmount: totals.saved.toFixed(2),
          remainingAmount: Prisma.Decimal.max(totals.target.minus(totals.saved), ZERO).toFixed(2),
          contributedInPeriod: totals.period.toFixed(2),
          progressPercentage: totals.target.isZero()
            ? '0.00'
            : totals.saved.dividedBy(totals.target).times(100).toFixed(2),
        })),
    };
  }

  private buildBudgetSummary(
    budgets: ReportBudgetRecord[],
    transactions: ReportTransactionRecord[],
    period: ReportPeriodDto,
  ) {
    const items = this.buildBudgetItems(budgets, transactions, period);
    const currencies = Array.from(
      new Set(budgets.map((budget) => budget.currency)),
    ).sort();
    const byType = currencies.flatMap((currency) => (
      [BudgetType.OVERALL, BudgetType.CATEGORY].map((type) => {
        const typeItems = items.filter(
          (item) => item.type === type && item.currency === currency,
        );
        const budgetAmount = typeItems.reduce(
          (total, item) => total.plus(item.budgetAmount),
          ZERO,
        );
        const spentAmount = typeItems.reduce(
          (total, item) => total.plus(item.spentAmount),
          ZERO,
        );

        return {
          currency,
          type,
          budgetCount: typeItems.length,
          budgetAmount: budgetAmount.toFixed(2),
          spentAmount: spentAmount.toFixed(2),
          remainingAmount: budgetAmount.minus(spentAmount).toFixed(2),
          usagePercentage: budgetAmount.isZero()
            ? '0.00'
            : spentAmount.dividedBy(budgetAmount).times(100).toFixed(2),
          onTrackCount: typeItems.filter((item) => item.status === 'ON_TRACK').length,
          nearLimitCount: typeItems.filter((item) => item.status === 'NEAR_LIMIT').length,
          exceededCount: typeItems.filter((item) => item.status === 'EXCEEDED').length,
        } satisfies BudgetTypeSummaryDto;
      })
    ));

    return { totalBudgets: budgets.length, byType };
  }

  private buildBudgetItems(
    budgets: ReportBudgetRecord[],
    transactions: ReportTransactionRecord[],
    period: ReportPeriodDto,
  ): BudgetPerformanceItemDto[] {
    return budgets.map((budget) => {
      const budgetFrom = businessWallTimeToInstant(prismaDateToBusinessDate(budget.startDate));
      const budgetTo = businessWallTimeToInstant(
        addBusinessDays(prismaDateToBusinessDate(budget.endDate), 1),
      );
      const reportFrom = new Date(Math.max(period.from.getTime(), budgetFrom.getTime()));
      const reportTo = new Date(Math.min(period.to.getTime(), budgetTo.getTime()));
      const matchingTransactions = transactions.filter((transaction) => (
        transaction.type === TransactionType.EXPENSE
        && businessWallTimeToInstant(prismaDateToBusinessDate(transaction.date)) >= reportFrom
        && businessWallTimeToInstant(prismaDateToBusinessDate(transaction.date)) < reportTo
        && transaction.wallet.currency === budget.currency
        && (!budget.categoryId || transaction.category.id === budget.categoryId)
      ));
      const spentAmount = matchingTransactions.reduce(
        (total, transaction) => total.plus(transaction.amount),
        ZERO,
      );
      const usagePercentage = spentAmount.dividedBy(budget.amount).times(100);
      let status: BudgetPerformanceStatus = 'ON_TRACK';
      if (spentAmount.greaterThan(budget.amount)) {
        status = 'EXCEEDED';
      } else if (usagePercentage.greaterThanOrEqualTo(budget.alertThreshold)) {
        status = 'NEAR_LIMIT';
      }

      return {
        id: budget.id,
        name: budget.name,
        type: budget.type,
        currency: budget.currency,
        period: budget.period,
        category: budget.category,
        budgetAmount: budget.amount.toFixed(2),
        spentAmount: spentAmount.toFixed(2),
        remainingAmount: budget.amount.minus(spentAmount).toFixed(2),
        usagePercentage: usagePercentage.toFixed(2),
        transactionCount: matchingTransactions.length,
        status,
        reportFrom,
        reportTo,
        budgetFrom,
        budgetTo,
        isArchived: budget.isArchived,
      };
    });
  }

  private resolveGranularity(
    requested: ReportGranularity,
    period: ReportPeriodDto,
  ): ResolvedReportGranularity {
    if (requested !== 'AUTO') {
      return requested;
    }

    if (period.preset === 'DAY') {
      return 'DAY';
    }
    if (period.preset === 'WEEK' || period.preset === 'MONTH') {
      return 'DAY';
    }
    if (period.preset === 'YEAR') {
      return 'MONTH';
    }

    const rangeDays = (period.to.getTime() - period.from.getTime()) / MILLISECONDS_PER_DAY;
    if (rangeDays <= 2) {
      return 'DAY';
    }
    if (rangeDays <= 90) {
      return 'DAY';
    }
    if (rangeDays <= 730) {
      return 'MONTH';
    }
    return 'YEAR';
  }

  private createBuckets(period: ReportPeriodDto, granularity: ResolvedReportGranularity) {
    const buckets: Array<{
      key: number;
      reportFrom: Date;
      reportTo: Date;
    }> = [];
    let bucketStart = this.getBucketStart(
      period.from,
      granularity,
      timeZoneOffsetMinutesAt(period.from),
    );

    while (bucketStart < period.to) {
      const next = this.getNextBucketStart(
        bucketStart,
        granularity,
        timeZoneOffsetMinutesAt(period.from),
      );
      buckets.push({
        key: bucketStart.getTime(),
        reportFrom: new Date(Math.max(bucketStart.getTime(), period.from.getTime())),
        reportTo: new Date(Math.min(next.getTime(), period.to.getTime())),
      });
      if (buckets.length > MAX_SERIES_POINTS) {
        throw new AppError(
          `The selected granularity produces more than ${MAX_SERIES_POINTS} data points`,
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }
      bucketStart = next;
    }

    return buckets;
  }

  private getBucketStart(
    date: Date,
    granularity: ResolvedReportGranularity,
    offsetMinutes: number,
  ) {
    const offset = offsetMinutes * MILLISECONDS_PER_MINUTE;
    const local = new Date(date.getTime() + offset);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const day = local.getUTCDate();
    let localStart: Date;

    switch (granularity) {
      case 'HOUR':
        localStart = new Date(Date.UTC(year, month, day, local.getUTCHours()));
        break;
      case 'WEEK': {
        const daysSinceMonday = (local.getUTCDay() + 6) % 7;
        localStart = new Date(Date.UTC(year, month, day - daysSinceMonday));
        break;
      }
      case 'MONTH':
        localStart = new Date(Date.UTC(year, month, 1));
        break;
      case 'YEAR':
        localStart = new Date(Date.UTC(year, 0, 1));
        break;
      default:
        localStart = new Date(Date.UTC(year, month, day));
    }

    return new Date(localStart.getTime() - offset);
  }

  private getNextBucketStart(
    bucketStart: Date,
    granularity: ResolvedReportGranularity,
    offsetMinutes: number,
  ) {
    const offset = offsetMinutes * MILLISECONDS_PER_MINUTE;
    const local = new Date(bucketStart.getTime() + offset);

    switch (granularity) {
      case 'HOUR':
        local.setUTCHours(local.getUTCHours() + 1);
        break;
      case 'DAY':
        local.setUTCDate(local.getUTCDate() + 1);
        break;
      case 'WEEK':
        local.setUTCDate(local.getUTCDate() + 7);
        break;
      case 'MONTH':
        local.setUTCMonth(local.getUTCMonth() + 1);
        break;
      case 'YEAR':
        local.setUTCFullYear(local.getUTCFullYear() + 1);
        break;
    }

    return new Date(local.getTime() - offset);
  }
}
