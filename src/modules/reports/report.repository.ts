import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { businessDateToPrismaDate, instantToBusinessDate } from '../../common/date-time/business-time';
import { ReportSavingGoalRecord, ReportTransactionRecord } from './report.dto';

const reportWalletSelect = {
  id: true,
  name: true,
  balance: true,
  currency: true,
  isDefault: true,
  isArchived: true,
} satisfies Prisma.WalletSelect;

const reportTransactionSelect = {
  amount: true,
  type: true,
  date: true,
  wallet: {
    select: {
      id: true,
      currency: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
    },
  },
} satisfies Prisma.TransactionSelect;

const reportBudgetSelect = {
  id: true,
  name: true,
  amount: true,
  currency: true,
  type: true,
  period: true,
  categoryId: true,
  startDate: true,
  endDate: true,
  alertThreshold: true,
  isArchived: true,
  category: {
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
    },
  },
} satisfies Prisma.BudgetSelect;

const reportSavingGoalSelect = {
  id: true,
  targetAmount: true,
  currency: true,
  status: true,
} satisfies Prisma.SavingGoalSelect;

export type ReportWalletRecord = Prisma.WalletGetPayload<{
  select: typeof reportWalletSelect;
}>;

export type ReportBudgetRecord = Prisma.BudgetGetPayload<{
  select: typeof reportBudgetSelect;
}>;

export interface ContributionSummary {
  savingGoalId: string;
  amount: Prisma.Decimal;
}

export class ReportRepository {
  findWalletById(userId: string, walletId: string) {
    return prisma.wallet.findFirst({
      where: { id: walletId, userId },
      select: reportWalletSelect,
    });
  }

  findWallets(userId: string, walletId?: string, currency?: string) {
    return prisma.wallet.findMany({
      where: {
        userId,
        ...(walletId ? { id: walletId } : {}),
        ...(currency ? { currency } : {}),
      },
      select: reportWalletSelect,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  findTransactions(
    userId: string,
    from: Date,
    to: Date,
    walletId?: string,
    currency?: string,
  ): Promise<ReportTransactionRecord[]> {
    return prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: businessDateToPrismaDate(instantToBusinessDate(from)),
          lt: businessDateToPrismaDate(instantToBusinessDate(to)),
        },
        ...(walletId ? { walletId } : {}),
        ...(currency ? { wallet: { currency } } : {}),
      },
      select: reportTransactionSelect,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  }

  findBudgets(userId: string, from: Date, to: Date, currency?: string) {
    return prisma.budget.findMany({
      where: {
        userId,
        startDate: { lt: businessDateToPrismaDate(instantToBusinessDate(to)) },
        endDate: { gte: businessDateToPrismaDate(instantToBusinessDate(from)) },
        ...(currency ? { currency } : {}),
      },
      select: reportBudgetSelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
  }

  findSavingGoals(userId: string, currency?: string): Promise<ReportSavingGoalRecord[]> {
    return prisma.savingGoal.findMany({
      where: {
        userId,
        isArchived: false,
        ...(currency ? { currency } : {}),
      },
      select: reportSavingGoalSelect,
      orderBy: [{ currency: 'asc' }, { targetDate: 'asc' }, { id: 'asc' }],
    });
  }

  async findContributionSummaries(
    savingGoalIds: string[],
    from?: Date,
    to?: Date,
  ): Promise<ContributionSummary[]> {
    if (savingGoalIds.length === 0) {
      return [];
    }

    const summaries = await prisma.savingContribution.groupBy({
      by: ['savingGoalId'],
      where: {
        savingGoalId: { in: savingGoalIds },
        ...(from && to ? { contributedAt: { gte: from, lt: to } } : {}),
      },
      _sum: { amount: true },
    });

    return summaries.map((summary) => ({
      savingGoalId: summary.savingGoalId,
      amount: summary._sum.amount ?? new Prisma.Decimal(0),
    }));
  }
}
