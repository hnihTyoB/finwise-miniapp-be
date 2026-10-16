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
  spendingScope?: 'ALL' | 'PERSONAL' | 'SHARED';
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
  isShared?: boolean;
}

export interface TransactionCategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
}

export interface TransactionCreatorDto {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface TransactionResponseDto {
  id: string;
  userId?: string;
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
  creator?: TransactionCreatorDto | null;
  createdBy?: TransactionCreatorDto | null;
  isSharedWallet?: boolean;
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
