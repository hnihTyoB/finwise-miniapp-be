import {
  Prisma,
  TransactionType,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  BusinessDate,
  businessDateToPrismaDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  BudgetQueryDto,
  PersistBudgetDto,
} from './budget.dto';

const budgetSelect = {
  id: true,
  userId: true,
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
  isRecurring: true,
  autoRenew: true,
  recurrenceGroupId: true,
  rolloverMode: true,
  rolloverAmount: true,
  autoRenewUntil: true,
  renewedAt: true,
  parentBudgetId: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      icon: true,
      color: true,
    },
  },
} satisfies Prisma.BudgetSelect;

export type BudgetRecord = Prisma.BudgetGetPayload<{
  select: typeof budgetSelect;
}>;

export interface BudgetSpendingSummary {
  amount: Prisma.Decimal;
  transactionCount: number;
  lastTransactionAt: BusinessDate | null;
}

export class BudgetRepository {
  async findAll(userId: string, query: BudgetQueryDto) {
    const {
      search,
      type,
      period,
      currency,
      categoryId,
      activeAt,
      includeArchived,
      isRecurring,
      sortBy,
      order,
      page,
      limit,
    } = query;
    const where: Prisma.BudgetWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(period ? { period } : {}),
      ...(currency ? { currency } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(isRecurring !== undefined ? { isRecurring } : {}),
      ...(activeAt
        ? {
          startDate: { lte: businessDateToPrismaDate(activeAt) },
          endDate: { gte: businessDateToPrismaDate(activeAt) },
        }
        : {}),
      ...(includeArchived ? {} : { isArchived: false }),
      ...(search
        ? {
          OR: [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
            {
              category: {
                name: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
            },
          ],
        }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [budgets, total] = await prisma.$transaction([
      prisma.budget.findMany({
        where,
        select: budgetSelect,
        orderBy: [
          { [sortBy]: order },
          { id: order },
        ],
        skip,
        take: limit,
      }),
      prisma.budget.count({ where }),
    ]);

    return {
      data: budgets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findById(userId: string, id: string) {
    return prisma.budget.findFirst({
      where: { id, userId },
      select: budgetSelect,
    });
  }

  findCategory(userId: string, categoryId: string) {
    return prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [
          { userId },
          { userId: null, isSystem: true },
        ],
      },
      select: {
        id: true,
        type: true,
        isArchived: true,
      },
    });
  }

  async getSpendingSummary(
    userId: string,
    categoryId: string | null,
    startDate: Date,
    endDate: Date,
    currency: string,
  ): Promise<BudgetSpendingSummary> {
    const result = await prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        ...(categoryId ? { categoryId } : {}),
        date: {
          gte: startDate,
          lte: endDate,
        },
        wallet: { currency },
      },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { date: true },
    });

    return {
      amount: result._sum.amount ?? new Prisma.Decimal(0),
      transactionCount: result._count._all,
      lastTransactionAt: result._max.date
        ? prismaDateToBusinessDate(result._max.date)
        : null,
    };
  }

  async getBatchSpendingSummaries(
    userId: string,
    budgets: BudgetRecord[],
  ): Promise<Map<string, BudgetSpendingSummary>> {
    const summaryMap = new Map<string, BudgetSpendingSummary>();
    if (budgets.length === 0) return summaryMap;

    const budgetIds = budgets.map((b) => b.id);
    const spendingRows = await prisma.$queryRaw<Array<{
      budget_id: string;
      total_amount: string;
      txn_count: number;
      last_date: Date | null;
    }>>`
      SELECT 
        b.id AS budget_id, 
        COALESCE(SUM(t.amount), 0)::text AS total_amount,
        COUNT(t.id)::int AS txn_count,
        MAX(t.date) AS last_date
      FROM budgets b
      LEFT JOIN wallets w ON w.user_id = b.user_id AND w.currency = b.currency
      LEFT JOIN transactions t ON t.wallet_id = w.id
        AND t.user_id = b.user_id
        AND t.type = 'EXPENSE'
        AND t.date >= b.start_date
        AND t.date <= b.end_date
        AND (b.category_id IS NULL OR t.category_id = b.category_id)
      WHERE b.id = ANY(${budgetIds}::uuid[]) AND b.user_id = ${userId}::uuid
      GROUP BY b.id;
    `;

    for (const row of spendingRows) {
      summaryMap.set(row.budget_id, {
        amount: new Prisma.Decimal(row.total_amount),
        transactionCount: row.txn_count,
        lastTransactionAt: row.last_date ? prismaDateToBusinessDate(row.last_date) : null,
      });
    }

    for (const budget of budgets) {
      if (!summaryMap.has(budget.id)) {
        summaryMap.set(budget.id, {
          amount: new Prisma.Decimal(0),
          transactionCount: 0,
          lastTransactionAt: null,
        });
      }
    }

    return summaryMap;
  }

  create(userId: string, data: PersistBudgetDto) {
    return prisma.budget.create({
      data: {
        userId,
        name: data.name,
        amount: data.amount,
        currency: data.currency,
        type: data.type,
        period: data.period,
        categoryId: data.categoryId,
        alertThreshold: data.alertThreshold,
        startDate: businessDateToPrismaDate(data.startDate),
        endDate: businessDateToPrismaDate(data.endDate),
        isRecurring: data.isRecurring ?? false,
        autoRenew: data.autoRenew ?? (data.isRecurring ?? false),
        recurrenceGroupId: data.recurrenceGroupId,
        rolloverMode: data.rolloverMode,
        rolloverAmount: data.rolloverAmount
          ? new Prisma.Decimal(data.rolloverAmount)
          : undefined,
        autoRenewUntil: data.autoRenewUntil
          ? businessDateToPrismaDate(data.autoRenewUntil)
          : null,
        renewedAt: data.renewedAt,
        parentBudgetId: data.parentBudgetId,
      },
      select: budgetSelect,
    });
  }

  update(id: string, data: PersistBudgetDto) {
    return prisma.budget.update({
      where: { id },
      data: {
        name: data.name,
        amount: data.amount,
        currency: data.currency,
        type: data.type,
        period: data.period,
        categoryId: data.categoryId,
        alertThreshold: data.alertThreshold,
        startDate: businessDateToPrismaDate(data.startDate),
        endDate: businessDateToPrismaDate(data.endDate),
        isRecurring: data.isRecurring,
        autoRenew: data.autoRenew,
        recurrenceGroupId: data.recurrenceGroupId,
        rolloverMode: data.rolloverMode,
        rolloverAmount: data.rolloverAmount
          ? new Prisma.Decimal(data.rolloverAmount)
          : undefined,
        autoRenewUntil: data.autoRenewUntil
          ? businessDateToPrismaDate(data.autoRenewUntil)
          : null,
      },
      select: budgetSelect,
    });
  }

  updateAutoRenew(userId: string, id: string, autoRenew: boolean) {
    return prisma.budget.update({
      where: { id, userId },
      data: { autoRenew },
      select: budgetSelect,
    });
  }

  findDueForRenewal(today: BusinessDate, limit = 50) {
    const todayDate = businessDateToPrismaDate(today);
    return prisma.budget.findMany({
      where: {
        isRecurring: true,
        autoRenew: true,
        isArchived: false,
        endDate: { lt: todayDate },
        renewedAt: null,
        OR: [
          { autoRenewUntil: null },
          { autoRenewUntil: { gte: todayDate } },
        ],
      },
      select: budgetSelect,
      take: limit,
      orderBy: { endDate: 'asc' },
    });
  }

  findDueForRenewalByUser(userId: string, today: BusinessDate) {
    const todayDate = businessDateToPrismaDate(today);
    return prisma.budget.findMany({
      where: {
        userId,
        isRecurring: true,
        autoRenew: true,
        isArchived: false,
        endDate: { lt: todayDate },
        renewedAt: null,
        OR: [
          { autoRenewUntil: null },
          { autoRenewUntil: { gte: todayDate } },
        ],
      },
      select: budgetSelect,
      orderBy: { endDate: 'asc' },
    });
  }

  findSeries(userId: string, recurrenceGroupId: string) {
    return prisma.budget.findMany({
      where: { userId, recurrenceGroupId },
      select: budgetSelect,
      orderBy: { startDate: 'asc' },
    });
  }

  renewBudgetTransaction(
    parentBudget: BudgetRecord,
    newBudgetData: PersistBudgetDto,
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Mark parent budget as renewed
      await tx.budget.update({
        where: { id: parentBudget.id },
        data: { renewedAt: new Date() },
      });

      // 2. Insert new budget for next cycle
      return tx.budget.create({
        data: {
          userId: parentBudget.userId,
          name: newBudgetData.name,
          amount: newBudgetData.amount,
          currency: newBudgetData.currency,
          type: newBudgetData.type,
          period: newBudgetData.period,
          categoryId: newBudgetData.categoryId,
          alertThreshold: newBudgetData.alertThreshold,
          startDate: businessDateToPrismaDate(newBudgetData.startDate),
          endDate: businessDateToPrismaDate(newBudgetData.endDate),
          isRecurring: true,
          autoRenew: true,
          recurrenceGroupId: parentBudget.recurrenceGroupId,
          rolloverMode: parentBudget.rolloverMode,
          rolloverAmount: newBudgetData.rolloverAmount
            ? new Prisma.Decimal(newBudgetData.rolloverAmount)
            : new Prisma.Decimal(0),
          autoRenewUntil: parentBudget.autoRenewUntil,
          parentBudgetId: parentBudget.id,
        },
        select: budgetSelect,
      });
    });
  }

  archive(id: string) {
    return prisma.budget.update({
      where: { id },
      data: { isArchived: true },
      select: budgetSelect,
    });
  }

  restore(id: string) {
    return prisma.budget.update({
      where: { id },
      data: { isArchived: false },
      select: budgetSelect,
    });
  }
}
