import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { businessDateToPrismaDate, instantToBusinessDate } from '../../common/date-time/business-time';

const aiCategorySelect = {
  id: true,
  name: true,
  type: true,
  isSystem: true,
} satisfies Prisma.CategorySelect;

const aiWalletSelect = {
  id: true,
  name: true,
  balance: true,
  currency: true,
  isDefault: true,
  isArchived: true,
} satisfies Prisma.WalletSelect;

const aiTransactionSelect = {
  walletId: true,
  categoryId: true,
  amount: true,
  type: true,
  description: true,
  date: true,
  wallet: {
    select: {
      name: true,
      currency: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.TransactionSelect;

const aiBudgetSelect = {
  name: true,
  amount: true,
  currency: true,
  type: true,
  startDate: true,
  endDate: true,
  alertThreshold: true,
  category: { select: { name: true } },
} satisfies Prisma.BudgetSelect;

const aiSavingGoalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  currency: true,
  targetDate: true,
  status: true,
} satisfies Prisma.SavingGoalSelect;

export type AICategoryRecord = Prisma.CategoryGetPayload<{
  select: typeof aiCategorySelect;
}>;
export type AIWalletRecord = Prisma.WalletGetPayload<{
  select: typeof aiWalletSelect;
}>;
export type AITransactionRecord = Prisma.TransactionGetPayload<{
  select: typeof aiTransactionSelect;
}>;
export type AIBudgetRecord = Prisma.BudgetGetPayload<{
  select: typeof aiBudgetSelect;
}>;
export type AISavingGoalRecord = Prisma.SavingGoalGetPayload<{
  select: typeof aiSavingGoalSelect;
}>;

export interface AISavingContributionSummary {
  savingGoalId: string;
  amount: Prisma.Decimal;
}

export interface AIFinancialContextRecord {
  wallets: AIWalletRecord[];
  categories: AICategoryRecord[];
  transactions: AITransactionRecord[];
  totalTransactionCount: number;
  transactionSummaries: Array<{
    walletId: string;
    categoryId: string;
    type: TransactionType;
    amount: Prisma.Decimal;
    count: number;
  }>;
  budgets: AIBudgetRecord[];
  totalBudgetCount: number;
  savingGoals: AISavingGoalRecord[];
  totalSavingGoalCount: number;
  contributionSummaries: AISavingContributionSummary[];
}

export class AIAssistantRepository {
  findVisibleCategories(userId: string, type?: TransactionType, limit = 200) {
    return prisma.category.findMany({
      where: {
        isArchived: false,
        ...(type ? { type } : {}),
        OR: [
          { userId, isSystem: false },
          { userId: null, isSystem: true },
        ],
      },
      select: aiCategorySelect,
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async getFinancialContext(
    userId: string,
    from: Date,
    to: Date,
    maxTransactions: number,
    currency?: string,
  ): Promise<AIFinancialContextRecord> {
    const businessFrom = businessDateToPrismaDate(instantToBusinessDate(from));
    const businessTo = businessDateToPrismaDate(instantToBusinessDate(to));
    const transactionWhere: Prisma.TransactionWhereInput = {
      userId,
      date: { gte: businessFrom, lt: businessTo },
      ...(currency ? { wallet: { currency } } : {}),
    };
    const [
      wallets,
      categories,
      transactions,
      totalTransactionCount,
      groupedTransactions,
      budgets,
      totalBudgetCount,
      savingGoals,
      totalSavingGoalCount,
    ] =
      await Promise.all([
        prisma.wallet.findMany({
          where: {
            userId,
            ...(currency ? { currency } : {}),
          },
          select: aiWalletSelect,
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        }),
        this.findVisibleCategories(userId, undefined, 500),
        prisma.transaction.findMany({
          where: transactionWhere,
          select: aiTransactionSelect,
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: maxTransactions,
        }),
        prisma.transaction.count({ where: transactionWhere }),
        prisma.transaction.groupBy({
          by: ['walletId', 'categoryId', 'type'],
          where: transactionWhere,
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.budget.findMany({
          where: {
            userId,
            isArchived: false,
            startDate: { lt: businessTo },
            endDate: { gte: businessFrom },
            ...(currency ? { currency } : {}),
          },
          select: aiBudgetSelect,
          orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
          take: 100,
        }),
        prisma.budget.count({
          where: {
            userId,
            isArchived: false,
            startDate: { lt: businessTo },
            endDate: { gte: businessFrom },
            ...(currency ? { currency } : {}),
          },
        }),
        prisma.savingGoal.findMany({
          where: {
            userId,
            isArchived: false,
            ...(currency ? { currency } : {}),
          },
          select: aiSavingGoalSelect,
          orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
          take: 100,
        }),
        prisma.savingGoal.count({
          where: {
            userId,
            isArchived: false,
            ...(currency ? { currency } : {}),
          },
        }),
      ]);

    const goalIds = savingGoals.map((goal) => goal.id);
    const groupedContributions = goalIds.length === 0
      ? []
      : await prisma.savingContribution.groupBy({
        by: ['savingGoalId'],
        where: { savingGoalId: { in: goalIds } },
        _sum: { amount: true },
      });

    return {
      wallets,
      categories,
      transactions,
      totalTransactionCount,
      transactionSummaries: groupedTransactions.map((item) => ({
        walletId: item.walletId,
        categoryId: item.categoryId,
        type: item.type,
        amount: item._sum.amount ?? new Prisma.Decimal(0),
        count: item._count._all,
      })),
      budgets,
      totalBudgetCount,
      savingGoals,
      totalSavingGoalCount,
      contributionSummaries: groupedContributions.map((item) => ({
        savingGoalId: item.savingGoalId,
        amount: item._sum.amount ?? new Prisma.Decimal(0),
      })),
    };
  }
}
