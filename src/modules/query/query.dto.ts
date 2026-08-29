export type QueryTimeRangeType =
  | 'TODAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_YEAR'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'CUSTOM';

export type QueryAggregationType = 'SUM' | 'COUNT' | 'AVERAGE' | 'MIN' | 'MAX' | 'LIST';

export type QueryGroupByType = 'CATEGORY' | 'WALLET' | 'DAY' | 'MONTH' | 'NONE';

export interface QueryAST {
  rawQuery: string;
  timeRange: {
    type: QueryTimeRangeType;
    dateFrom?: string; // YYYY-MM-DD
    dateTo?: string; // YYYY-MM-DD
  };
  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ALL';
  categoryIds?: string[];
  categoryNames?: string[];
  walletIds?: string[];
  walletNames?: string[];
  amountFilter?: {
    minAmount?: number;
    maxAmount?: number;
  };
  aggregation: QueryAggregationType;
  groupBy: QueryGroupByType;
  limit?: number;
}

export interface ParseQueryResponseDto {
  ast: QueryAST;
  interpretedDescription: string;
}

export interface QueryGroupResultDto {
  key: string;
  label: string;
  total: string;
  count: number;
}

export interface QueryTransactionItemDto {
  id: string;
  date: string;
  amount: string;
  type: string;
  description: string | null;
  categoryName: string;
  walletName: string;
}

export interface ExecuteQueryResultDto {
  summary: string;
  timeRangeDescription: string;
  aggregation: QueryAggregationType;
  totalValue: string;
  count: number;
  average: string;
  minValue: string | null;
  maxValue: string | null;
  currency: string;
  groups?: QueryGroupResultDto[];
  items?: QueryTransactionItemDto[];
}
