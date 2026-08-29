import { TransactionType } from '@prisma/client';
import { AIUsage } from '../../common/ai/ai-provider';

export interface AIAnalysisScopeDto {
  dateFrom?: Date;
  dateTo?: Date;
  currency?: string;
}

export interface CategorizeTransactionDto {
  description: string;
  amount?: string;
  type?: TransactionType;
  merchant?: string;
  occurredAt?: Date;
}

export interface ExtractReceiptDto {
  languageHint?: string;
  currencyHint?: string;
}

export interface FinancialChatDto extends AIAnalysisScopeDto {
  question: string;
}

export interface FinancialInsightsDto extends AIAnalysisScopeDto {
  focus: 'ALL' | 'SPENDING' | 'INCOME' | 'CASH_FLOW';
}

export interface FinancialRecommendationsDto extends AIAnalysisScopeDto {
  priority: 'BALANCED' | 'REDUCE_SPENDING' | 'GROW_SAVINGS';
}

export interface AIResponseMetaDto {
  provider: string;
  model: string;
  usage: AIUsage;
  context?: {
    from: Date;
    to: Date;
    currency: string | null;
    transactionCount: number;
    totalTransactionCount: number;
    truncated: boolean;
  };
}

export interface AIServiceResult<T> {
  data: T;
  meta: AIResponseMetaDto;
}
