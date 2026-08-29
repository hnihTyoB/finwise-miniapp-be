import {
  QueryAggregationType,
  QueryAST,
  QueryGroupByType,
  QueryTimeRangeType,
} from './query.dto';

export interface UserEntityContext {
  categories: Array<{ id: string; name: string }>;
  wallets: Array<{ id: string; name: string }>;
}

export class QueryParser {
  static parse(queryText: string, context: UserEntityContext): QueryAST {
    const raw = queryText.trim();
    const lower = raw.toLowerCase();

    // 1. Time Range Resolution
    const timeRangeType = this.extractTimeRange(lower);

    // 2. Transaction Type Resolution
    const transactionType = this.extractTransactionType(lower);

    // 3. Aggregation Resolution
    const aggregation = this.extractAggregation(lower);

    // 4. GroupBy Resolution
    const groupBy = this.extractGroupBy(lower);

    // 5. Amount Filter Resolution
    const amountFilter = this.extractAmountFilter(lower);

    // 6. Entity Matching (Categories & Wallets)
    const matchedCategories = context.categories.filter((cat) =>
      lower.includes(cat.name.toLowerCase()),
    );
    const matchedWallets = context.wallets.filter((w) =>
      lower.includes(w.name.toLowerCase()),
    );

    return {
      rawQuery: raw,
      timeRange: {
        type: timeRangeType,
      },
      transactionType,
      categoryIds: matchedCategories.length > 0 ? matchedCategories.map((c) => c.id) : undefined,
      categoryNames: matchedCategories.length > 0 ? matchedCategories.map((c) => c.name) : undefined,
      walletIds: matchedWallets.length > 0 ? matchedWallets.map((w) => w.id) : undefined,
      walletNames: matchedWallets.length > 0 ? matchedWallets.map((w) => w.name) : undefined,
      amountFilter: amountFilter || undefined,
      aggregation,
      groupBy,
      limit: 30,
    };
  }

  private static extractTimeRange(text: string): QueryTimeRangeType {
    if (text.includes('hôm nay') || text.includes('today')) return 'TODAY';
    if (text.includes('tuần trước') || text.includes('last week')) return 'LAST_WEEK';
    if (text.includes('tuần này') || text.includes('this week')) return 'THIS_WEEK';
    if (text.includes('tháng trước') || text.includes('last month')) return 'LAST_MONTH';
    if (text.includes('tháng này') || text.includes('this month')) return 'THIS_MONTH';
    if (text.includes('năm nay') || text.includes('this year')) return 'THIS_YEAR';
    if (text.includes('7 ngày') || text.includes('7 days')) return 'LAST_7_DAYS';
    if (text.includes('30 ngày') || text.includes('30 days')) return 'LAST_30_DAYS';
    return 'THIS_MONTH';
  }

  private static extractTransactionType(text: string): 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ALL' {
    if (text.includes('thu nhập') || text.includes('tiền thu') || text.includes('income')) {
      return 'INCOME';
    }
    if (text.includes('chuyển khoản') || text.includes('chuyển tiền') || text.includes('transfer')) {
      return 'TRANSFER';
    }
    if (text.includes('tất cả') || text.includes('all')) {
      return 'ALL';
    }
    return 'EXPENSE';
  }

  private static extractAggregation(text: string): QueryAggregationType {
    if (text.includes('đếm') || text.includes('số lượng') || text.includes('bao nhiêu lần') || text.includes('count')) {
      return 'COUNT';
    }
    if (text.includes('trung bình') || text.includes('bình quân') || text.includes('average') || text.includes('avg')) {
      return 'AVERAGE';
    }
    if (text.includes('lớn nhất') || text.includes('cao nhất') || text.includes('nhiều nhất') || text.includes('max')) {
      return 'MAX';
    }
    if (text.includes('nhỏ nhất') || text.includes('ít nhất') || text.includes('thấp nhất') || text.includes('min')) {
      return 'MIN';
    }
    if (text.includes('danh sách') || text.includes('liệt kê') || text.includes('xem các') || text.includes('list') || text.includes('show')) {
      return 'LIST';
    }
    return 'SUM';
  }

  private static extractGroupBy(text: string): QueryGroupByType {
    if (text.includes('theo danh mục') || text.includes('theo loại') || text.includes('by category')) {
      return 'CATEGORY';
    }
    if (text.includes('theo ví') || text.includes('by wallet')) {
      return 'WALLET';
    }
    if (text.includes('theo ngày') || text.includes('by day') || text.includes('từng ngày')) {
      return 'DAY';
    }
    if (text.includes('theo tháng') || text.includes('by month') || text.includes('từng tháng')) {
      return 'MONTH';
    }
    return 'NONE';
  }

  private static extractAmountFilter(text: string): { minAmount?: number; maxAmount?: number } | null {
    // Regex for: trên / > / lớn hơn X
    const gtMatch = text.match(/(?:trên|>|lớn hơn|nhiều hơn)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|m|vnd|đ)?/i);
    if (gtMatch) {
      const minVal = this.parseNumericAmount(gtMatch[1], gtMatch[2]);
      if (minVal > 0) return { minAmount: minVal };
    }

    // Regex for: dưới / < / nhỏ hơn X
    const ltMatch = text.match(/(?:dưới|<|nhỏ hơn|ít hơn)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|m|vnd|đ)?/i);
    if (ltMatch) {
      const maxVal = this.parseNumericAmount(ltMatch[1], ltMatch[2]);
      if (maxVal > 0) return { maxAmount: maxVal };
    }

    return null;
  }

  private static parseNumericAmount(numStr: string, unitStr?: string): number {
    const rawNum = parseFloat(numStr.replace(',', '.'));
    if (isNaN(rawNum)) return 0;

    const unit = (unitStr || '').toLowerCase();
    if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') {
      return rawNum * 1000;
    }
    if (unit === 'tr' || unit === 'triệu' || unit === 'm') {
      return rawNum * 1000000;
    }
    return rawNum;
  }
}
