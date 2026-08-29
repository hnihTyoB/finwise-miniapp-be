import { TransactionType } from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export type TransactionSortField =
  | 'amount'
  | 'date'
  | 'description'
  | 'createdAt'
  | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface TransactionQueryDto {
  search?: string;
  walletId?: string;
  categoryId?: string;
  type?: TransactionType;
  dateFrom?: BusinessDate;
  dateTo?: BusinessDate;
  minAmount?: string;
  maxAmount?: string;
  sortBy: TransactionSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateTransactionDto {
  walletId: string;
  categoryId: string;
  amount: string;
  type: TransactionType;
  description?: string | null;
  location?: string | null;
  date: BusinessDate;
}

export interface UpdateTransactionDto {
  walletId?: string;
  categoryId?: string;
  amount?: string;
  type?: TransactionType;
  description?: string | null;
  location?: string | null;
  date?: BusinessDate;
}

export interface TransactionWalletDto {
  id: string;
  name: string;
  currency: string;
}

export interface TransactionCategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
}

export interface TransactionResponseDto {
  id: string;
  walletId: string;
  categoryId: string;
  amount: string;
  type: TransactionType;
  description: string | null;
  receiptUrl: string | null;
  location: string | null;
  date: BusinessDate;
  createdAt: Date;
  updatedAt: Date;
  wallet: TransactionWalletDto;
  category: TransactionCategoryDto;
}

export interface TransactionListResponseDto {
  data: TransactionResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
