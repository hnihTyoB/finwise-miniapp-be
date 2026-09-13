import { Prisma, TransactionType } from '@prisma/client';
import {
  addBusinessDays,
  BusinessDate,
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import { prisma } from '../../database/prisma.client';
import {
  ExecuteQueryResultDto,
  QueryAST,
  QueryGroupResultDto,
  QueryTimeRangeType,
  QueryTransactionItemDto,
} from './query.dto';

export class QueryCompiler {
  static resolveDateRange(timeRange: { type: QueryTimeRangeType; dateFrom?: string; dateTo?: string }): {
    from: BusinessDate;
    to: BusinessDate;
    description: string;
  } {
    const today = instantToBusinessDate(new Date());
    const [yearStr, monthStr, dayStr] = today.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    switch (timeRange.type) {
      case 'TODAY':
        return { from: today, to: today, description: 'Hôm nay' };

      case 'THIS_WEEK': {
        const d = new Date(Date.UTC(year, month - 1, day));
        const dayOfWeek = d.getUTCDay(); // 0 is Sun, 1 is Mon
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = addBusinessDays(today, diffToMon);
        const sunday = addBusinessDays(monday, 6);
        return { from: monday, to: sunday, description: 'Tuần này' };
      }

      case 'LAST_WEEK': {
        const d = new Date(Date.UTC(year, month - 1, day));
        const dayOfWeek = d.getUTCDay();
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const thisMonday = addBusinessDays(today, diffToMon);
        const lastMonday = addBusinessDays(thisMonday, -7);
        const lastSunday = addBusinessDays(lastMonday, 6);
        return { from: lastMonday, to: lastSunday, description: 'Tuần trước' };
      }

      case 'THIS_MONTH': {
        const firstDay = `${yearStr}-${monthStr}-01` as BusinessDate;
        const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const lastDay = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, '0')}` as BusinessDate;
        return { from: firstDay, to: lastDay, description: `Tháng ${month}/${year}` };
      }

      case 'LAST_MONTH': {
        const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
        const pYear = prevMonthDate.getUTCFullYear();
        const pMonth = prevMonthDate.getUTCMonth() + 1;
        const pMonthStr = String(pMonth).padStart(2, '0');
        const firstDay = `${pYear}-${pMonthStr}-01` as BusinessDate;
        const lastDayNum = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
        const lastDay = `${pYear}-${pMonthStr}-${String(lastDayNum).padStart(2, '0')}` as BusinessDate;
        return { from: firstDay, to: lastDay, description: `Tháng ${pMonth}/${pYear}` };
      }

      case 'THIS_YEAR': {
        const firstDay = `${yearStr}-01-01` as BusinessDate;
        const lastDay = `${yearStr}-12-31` as BusinessDate;
        return { from: firstDay, to: lastDay, description: `Năm ${year}` };
      }

      case 'LAST_7_DAYS': {
        const from = addBusinessDays(today, -6);
        return { from, to: today, description: '7 ngày qua' };
      }

      case 'LAST_30_DAYS': {
        const from = addBusinessDays(today, -29);
        return { from, to: today, description: '30 ngày qua' };
      }

      case 'CUSTOM':
      default: {
        const from = (timeRange.dateFrom as BusinessDate) || today;
        const to = (timeRange.dateTo as BusinessDate) || today;
        return { from, to, description: `Từ ${from} đến ${to}` };
      }
    }
  }

  static async execute(userId: string, ast: QueryAST): Promise<ExecuteQueryResultDto> {
    const { from, to, description: timeRangeDesc } = this.resolveDateRange(ast.timeRange);

    const fromDatePrisma = businessDateToPrismaDate(from);
    const toDatePrisma = businessDateToPrismaDate(to);

    // Branch 1: Handle TRANSFER querying on Prisma Transfer model
    if (ast.transactionType === 'TRANSFER') {
      const nextDayAfterTo = new Date(toDatePrisma.getTime() + 24 * 60 * 60 * 1000);
      const transferWhere: Prisma.TransferWhereInput = {
        userId,
        transferredAt: {
          gte: fromDatePrisma,
          lt: nextDayAfterTo,
        },
        ...(ast.walletIds && ast.walletIds.length > 0
          ? {
              OR: [
                { sourceWalletId: { in: ast.walletIds } },
                { destinationWalletId: { in: ast.walletIds } },
              ],
            }
          : {}),
        ...(ast.amountFilter?.minAmount || ast.amountFilter?.maxAmount
          ? {
              amount: {
                ...(ast.amountFilter.minAmount ? { gte: ast.amountFilter.minAmount } : {}),
                ...(ast.amountFilter.maxAmount ? { lte: ast.amountFilter.maxAmount } : {}),
              },
            }
          : {}),
      };

      const agg = await prisma.transfer.aggregate({
        where: transferWhere,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
        _min: { amount: true },
        _max: { amount: true },
      });

      const totalVal = agg._sum.amount ? agg._sum.amount.toNumber() : 0;
      const count = agg._count.id || 0;
      const avgVal = agg._avg.amount ? agg._avg.amount.toNumber() : 0;
      const minVal = agg._min.amount ? agg._min.amount.toNumber() : null;
      const maxVal = agg._max.amount ? agg._max.amount.toNumber() : null;

      let items: QueryTransactionItemDto[] | undefined;
      if (ast.aggregation === 'LIST' || count > 0) {
        const records = await prisma.transfer.findMany({
          where: transferWhere,
          include: {
            sourceWallet: { select: { name: true } },
            destinationWallet: { select: { name: true } },
          },
          orderBy: { transferredAt: 'desc' },
          take: ast.limit || 30,
        });

        items = records.map((r) => ({
          id: r.id,
          date: instantToBusinessDate(r.transferredAt),
          amount: r.amount.toFixed(2),
          type: 'EXPENSE' as TransactionType,
          description: r.note || `Chuyển từ ${r.sourceWallet.name} sang ${r.destinationWallet.name}`,
          categoryName: 'Chuyển tiền',
          walletName: `${r.sourceWallet.name} -> ${r.destinationWallet.name}`,
        }));
      }

      const entityLabel = ast.walletNames?.length ? `ví ${ast.walletNames.join(', ')}` : '';
      const summary = count === 0
        ? `Không tìm thấy giao dịch chuyển khoản nào ${entityLabel ? `thuộc ${entityLabel} ` : ''}trong khoảng thời gian ${timeRangeDesc}.`
        : `Tổng chuyển khoản ${entityLabel ? `thuộc ${entityLabel} ` : ''}trong ${timeRangeDesc} là ${totalVal.toLocaleString('vi-VN')} VND qua ${count} giao dịch (bình quân: ${Math.round(avgVal).toLocaleString('vi-VN')} VND/giao dịch).`;

      return {
        summary,
        timeRangeDescription: timeRangeDesc,
        aggregation: ast.aggregation,
        totalValue: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        count,
        average: (agg._avg.amount ?? new Prisma.Decimal(0)).toFixed(2),
        minValue: agg._min.amount ? agg._min.amount.toFixed(2) : null,
        maxValue: agg._max.amount ? agg._max.amount.toFixed(2) : null,
        currency: 'VND',
        items,
      };
    }

    // Branch 2: Handle Standard INCOME / EXPENSE / ALL
    const where: Prisma.TransactionWhereInput = {
      userId,
      date: {
        gte: fromDatePrisma,
        lte: toDatePrisma,
      },
      ...(ast.transactionType === 'INCOME' || ast.transactionType === 'EXPENSE'
        ? { type: ast.transactionType }
        : {}),
      ...(ast.categoryIds && ast.categoryIds.length > 0
        ? { categoryId: { in: ast.categoryIds } }
        : {}),
      ...(ast.walletIds && ast.walletIds.length > 0
        ? { walletId: { in: ast.walletIds } }
        : {}),
      ...(ast.amountFilter?.minAmount || ast.amountFilter?.maxAmount
        ? {
            amount: {
              ...(ast.amountFilter.minAmount ? { gte: ast.amountFilter.minAmount } : {}),
              ...(ast.amountFilter.maxAmount ? { lte: ast.amountFilter.maxAmount } : {}),
            },
          }
        : {}),
    };

    // Query aggregate
    const agg = await prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
      _avg: { amount: true },
      _min: { amount: true },
      _max: { amount: true },
    });

    const totalVal = agg._sum.amount ? agg._sum.amount.toNumber() : 0;
    const count = agg._count.id || 0;
    const avgVal = agg._avg.amount ? agg._avg.amount.toNumber() : 0;
    const minVal = agg._min.amount ? agg._min.amount.toNumber() : null;
    const maxVal = agg._max.amount ? agg._max.amount.toNumber() : null;

    let groups: QueryGroupResultDto[] | undefined;
    let items: QueryTransactionItemDto[] | undefined;

    // Handle GroupBy
    if (ast.groupBy === 'CATEGORY') {
      const grouped = await prisma.transaction.groupBy({
        by: ['categoryId'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
      });

      const categories = await prisma.category.findMany({
        where: { id: { in: grouped.map((g) => g.categoryId) } },
        select: { id: true, name: true },
      });
      const catMap = new Map(categories.map((c) => [c.id, c.name]));

      groups = grouped.map((g) => ({
        key: g.categoryId,
        label: catMap.get(g.categoryId) || 'Khác',
        total: g._sum.amount ? g._sum.amount.toFixed(2) : '0.00',
        count: g._count.id,
      }));
    } else if (ast.groupBy === 'WALLET') {
      const grouped = await prisma.transaction.groupBy({
        by: ['walletId'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
      });

      const wallets = await prisma.wallet.findMany({
        where: { id: { in: grouped.map((g) => g.walletId) } },
        select: { id: true, name: true },
      });
      const walletMap = new Map(wallets.map((w) => [w.id, w.name]));

      groups = grouped.map((g) => ({
        key: g.walletId,
        label: walletMap.get(g.walletId) || 'Ví',
        total: g._sum.amount ? g._sum.amount.toFixed(2) : '0.00',
        count: g._count.id,
      }));
    }

    // Handle Item Listing
    if (ast.aggregation === 'LIST' || (!groups && count > 0)) {
      const records = await prisma.transaction.findMany({
        where,
        include: {
          category: { select: { name: true } },
          wallet: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: ast.limit || 30,
      });

      items = records.map((r) => ({
        id: r.id,
        date: prismaDateToBusinessDate(r.date),
        amount: r.amount.toFixed(2),
        type: r.type,
        description: r.description,
        categoryName: r.category.name,
        walletName: r.wallet.name,
      }));
    }

    // Generate Natural Language Summary with Multi-Currency Awareness
    const typeLabel =
      ast.transactionType === 'INCOME'
        ? 'thu nhập'
        : 'chi tiêu';

    const entityLabel = ast.categoryNames?.length
      ? `danh mục ${ast.categoryNames.join(', ')}`
      : ast.walletNames?.length
        ? `ví ${ast.walletNames.join(', ')}`
        : '';

    // Group by wallet to resolve distinct currencies
    const walletAggregations = await prisma.transaction.groupBy({
      by: ['walletId'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    const queriedWallets = await prisma.wallet.findMany({
      where: { id: { in: walletAggregations.map((w) => w.walletId) } },
      select: { id: true, name: true, currency: true },
    });
    const walletMetaMap = new Map(queriedWallets.map((w) => [w.id, w]));

    const currencyTotals = new Map<string, { sum: number; count: number }>();
    for (const item of walletAggregations) {
      const wallet = walletMetaMap.get(item.walletId);
      const cur = wallet?.currency || 'VND';
      const existing = currencyTotals.get(cur) || { sum: 0, count: 0 };
      existing.sum += item._sum.amount ? item._sum.amount.toNumber() : 0;
      existing.count += item._count.id;
      currencyTotals.set(cur, existing);
    }

    let resolvedCurrency = 'VND';
    let summary: string;

    if (count === 0) {
      summary = `Không tìm thấy giao dịch ${typeLabel} nào ${entityLabel ? `thuộc ${entityLabel} ` : ''}trong khoảng thời gian ${timeRangeDesc}.`;
    } else if (currencyTotals.size > 1) {
      resolvedCurrency = 'MULTI';
      const currencyBreakdown = Array.from(currencyTotals.entries())
        .map(([cur, data]) => `${data.sum.toLocaleString('vi-VN')} ${cur} (${data.count} giao dịch)`)
        .join(' và ');
      summary = `Tổng ${typeLabel} ${entityLabel ? `thuộc ${entityLabel} ` : ''}trong ${timeRangeDesc} là: ${currencyBreakdown} (tổng cộng ${count} giao dịch).`;
    } else {
      if (currencyTotals.size === 1) {
        resolvedCurrency = Array.from(currencyTotals.keys())[0];
      }
      summary = `Tổng ${typeLabel} ${entityLabel ? `thuộc ${entityLabel} ` : ''}trong ${timeRangeDesc} là ${totalVal.toLocaleString('vi-VN')} ${resolvedCurrency} qua ${count} giao dịch (bình quân: ${Math.round(avgVal).toLocaleString('vi-VN')} ${resolvedCurrency}/giao dịch).`;
    }

    return {
      summary,
      timeRangeDescription: timeRangeDesc,
      aggregation: ast.aggregation,
      totalValue: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count,
      average: (agg._avg.amount ?? new Prisma.Decimal(0)).toFixed(2),
      minValue: agg._min.amount ? agg._min.amount.toFixed(2) : null,
      maxValue: agg._max.amount ? agg._max.amount.toFixed(2) : null,
      currency: resolvedCurrency,
      groups,
      items,
    };
  }
}
