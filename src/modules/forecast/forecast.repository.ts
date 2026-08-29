import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { prismaDateToBusinessDate } from '../../common/date-time/business-time';
import { BudgetForecastInput, DailyBucket } from './forecast-math';

export interface ForecastWalletRecord {
  id: string;
  name: string;
  balance: Prisma.Decimal;
  currency: string;
  isArchived: boolean;
}

export class ForecastRepository {
  async findWallets(
    userId: string,
    walletId?: string,
    currency?: string,
  ): Promise<ForecastWalletRecord[]> {
    return prisma.wallet.findMany({
      where: {
        userId,
        isArchived: false,
        ...(walletId ? { id: walletId } : {}),
        ...(currency ? { currency } : {}),
      },
      select: {
        id: true,
        name: true,
        balance: true,
        currency: true,
        isArchived: true,
      },
    });
  }

  async findHistoricalDailyBuckets(
    userId: string,
    from: Date,
    to: Date,
    walletId?: string,
    currency?: string,
  ): Promise<{ dailyBuckets: DailyBucket[]; totalTransactionCount: number }> {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lt: to,
        },
        ...(walletId ? { walletId } : {}),
        ...(currency ? { wallet: { currency } } : {}),
      },
      select: {
        id: true,
        amount: true,
        type: true,
        date: true,
      },
    });

    const bucketMap = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();

    transactions.forEach((tx) => {
      const dateKey = prismaDateToBusinessDate(tx.date);
      const current = bucketMap.get(dateKey) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };

      if (tx.type === TransactionType.INCOME) {
        current.income = current.income.plus(tx.amount);
      } else {
        current.expense = current.expense.plus(tx.amount);
      }
      bucketMap.set(dateKey, current);
    });

    const dailyBuckets: DailyBucket[] = Array.from(bucketMap.entries()).map(
      ([date, flows]) => ({
        date: date as `${number}-${number}-${number}`,
        income: flows.income,
        expense: flows.expense,
      }),
    );

    return {
      dailyBuckets,
      totalTransactionCount: transactions.length,
    };
  }

  async findActiveBudgets(
    userId: string,
    asOfDateInstant: Date,
    currency?: string,
  ): Promise<BudgetForecastInput[]> {
    const budgets = await prisma.budget.findMany({
      where: {
        userId,
        isArchived: false,
        startDate: { lte: asOfDateInstant },
        endDate: { gte: asOfDateInstant },
        ...(currency ? { currency } : {}),
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    if (budgets.length === 0) {
      return [];
    }

    const budgetIds = budgets.map((b) => b.id);
    const spendingRows = await prisma.$queryRaw<Array<{ budget_id: string; total_spent: string }>>`
      SELECT b.id AS budget_id, COALESCE(SUM(t.amount), 0)::text AS total_spent
      FROM budgets b
      LEFT JOIN wallets w ON w.user_id = b.user_id AND w.currency = b.currency
      LEFT JOIN transactions t ON t.wallet_id = w.id
        AND t.user_id = b.user_id
        AND t.type = 'EXPENSE'
        AND t.date >= b.start_date
        AND t.date <= b.end_date
        AND (b.category_id IS NULL OR t.category_id = b.category_id)
      WHERE b.id = ANY(${budgetIds}::uuid[])
      GROUP BY b.id;
    `;

    const spentByBudgetId = new Map<string, Prisma.Decimal>(
      spendingRows.map((row) => [row.budget_id, new Prisma.Decimal(row.total_spent)]),
    );

    return budgets.map((budget) => {
      const endBusinessDate = prismaDateToBusinessDate(budget.endDate);
      return {
        id: budget.id,
        name: budget.name,
        categoryName: budget.category?.name ?? null,
        currency: budget.currency,
        amount: budget.amount,
        spentAmount: spentByBudgetId.get(budget.id) ?? new Prisma.Decimal(0),
        startDate: prismaDateToBusinessDate(budget.startDate) as `${number}-${number}-${number}`,
        endDate: endBusinessDate as `${number}-${number}-${number}`,
        alertThreshold: budget.alertThreshold,
      };
    });
  }
}
