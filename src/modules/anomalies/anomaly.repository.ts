import { TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export class AnomalyRepository {
  async getCategoryHistory(
    userId: string,
    categoryId: string,
    excludeTxnId?: string,
    days = 60,
  ): Promise<number[]> {
    const today = instantToBusinessDate(new Date());
    const sinceBusinessDate = addBusinessDays(today, -days);
    const since = businessDateToPrismaDate(sinceBusinessDate);

    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        categoryId,
        type: TransactionType.EXPENSE,
        date: { gte: since },
        ...(excludeTxnId ? { id: { not: excludeTxnId } } : {}),
      },
      select: {
        amount: true,
      },
      orderBy: {
        date: 'desc',
      },
      take: 200,
    });

    return txns.map((t) => t.amount.toNumber());
  }

  async getRecentWalletTxnCount(
    userId: string,
    walletId: string,
    windowMinutes = 20,
    excludeTxnId?: string,
  ): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * MILLISECONDS_PER_MINUTE);

    return prisma.transaction.count({
      where: {
        userId,
        walletId,
        createdAt: { gte: since },
        ...(excludeTxnId ? { id: { not: excludeTxnId } } : {}),
      },
    });
  }

  async getBatchCategoryHistories(
    userId: string,
    categoryIds: string[],
    days = 60,
  ): Promise<Map<string, Array<{ id: string; amount: number }>>> {
    const today = instantToBusinessDate(new Date());
    const sinceBusinessDate = addBusinessDays(today, -days);
    const since = businessDateToPrismaDate(sinceBusinessDate);

    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        categoryId: { in: categoryIds },
        type: TransactionType.EXPENSE,
        date: { gte: since },
      },
      select: {
        id: true,
        categoryId: true,
        amount: true,
      },
      orderBy: {
        date: 'desc',
      },
      take: 2000,
    });

    const resultMap = new Map<string, Array<{ id: string; amount: number }>>();
    for (const tx of txns) {
      const list = resultMap.get(tx.categoryId) || [];
      if (list.length < 200) {
        list.push({ id: tx.id, amount: tx.amount.toNumber() });
        resultMap.set(tx.categoryId, list);
      }
    }
    return resultMap;
  }

  async getBatchWalletBalances(userId: string, walletIds: string[]): Promise<Map<string, number>> {
    const wallets = await prisma.wallet.findMany({
      where: { id: { in: walletIds }, userId },
      select: { id: true, balance: true },
    });
    const map = new Map<string, number>();
    for (const w of wallets) {
      map.set(w.id, w.balance.toNumber());
    }
    return map;
  }

  async getWalletBalance(userId: string, walletId: string): Promise<number> {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
      select: { balance: true },
    });
    return wallet ? wallet.balance.toNumber() : 0;
  }

  async getRecentExpenseTransactions(userId: string, limit = 50) {
    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
      },
      include: {
        category: { select: { id: true, name: true } },
        wallet: { select: { id: true, name: true, currency: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return txns.map((t) => ({
      id: t.id,
      amount: t.amount.toFixed(2),
      currency: t.wallet.currency,
      categoryName: t.category.name,
      categoryId: t.categoryId,
      walletName: t.wallet.name,
      walletId: t.walletId,
      date: prismaDateToBusinessDate(t.date),
      createdAt: t.createdAt,
    }));
  }
}
