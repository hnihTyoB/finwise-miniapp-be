import {
  RecurringTransactionFrequency,
  RecurringTransactionMissedRunPolicy,
  TransactionType,
} from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export interface RecurringTransactionQueryDto {
  isActive?: boolean;
  page: number;
  limit: number;
}

export interface CreateRecurringTransactionDto {
  walletId: string;
  categoryId: string;
  amount: string;
  type: TransactionType;
  description?: string | null;
  location?: string | null;
  frequency: RecurringTransactionFrequency;
  repeatInterval: number;
  anchorDate: BusinessDate;
  endDate?: BusinessDate | null;
  missedRunPolicy: RecurringTransactionMissedRunPolicy;
  isActive: boolean;
}

export type UpdateRecurringTransactionDto = Partial<Omit<
  CreateRecurringTransactionDto,
  'isActive'
>>;

export interface RecurringTransactionPreviewQueryDto {
  count: number;
  from?: BusinessDate;
}

export interface RecurringTransactionHistoryQueryDto {
  page: number;
  limit: number;
}

export interface ConvertSubscriptionToRecurringTransactionDto {
  merchantName: string;
  walletId: string;
  categoryId: string;
  amount: string;
  frequency: RecurringTransactionFrequency;
  nextExpectedAt: BusinessDate;
}
