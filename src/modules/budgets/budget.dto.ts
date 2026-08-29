import { BudgetPeriod, BudgetType, TransactionType } from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export type BudgetSortField =
  | 'name'
  | 'amount'
  | 'startDate'
  | 'endDate'
  | 'createdAt'
  | 'updatedAt';
export type SortOrder = 'asc' | 'desc';
export type BudgetTimeStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';
export type BudgetUsageStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'EXCEEDED';

export interface BudgetQueryDto {
  search?: string;
  type?: BudgetType;
  period?: BudgetPeriod;
  currency?: string;
  categoryId?: string;
  activeAt?: BusinessDate;
  includeArchived: boolean;
  sortBy: BudgetSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateBudgetDto {
  name: string;
  amount: string;
  currency: string;
  type: BudgetType;
  period: BudgetPeriod;
  categoryId?: string | null;
  startDate: BusinessDate;
  endDate?: BusinessDate;
  alertThreshold: string;
}

export interface UpdateBudgetDto {
  name?: string;
  amount?: string;
  currency?: string;
  type?: BudgetType;
  period?: BudgetPeriod;
  categoryId?: string | null;
  startDate?: BusinessDate;
  endDate?: BusinessDate;
  alertThreshold?: string;
}

export interface PersistBudgetDto {
  name: string;
  amount: string;
  currency: string;
  type: BudgetType;
  period: BudgetPeriod;
  categoryId: string | null;
  startDate: BusinessDate;
  endDate: BusinessDate;
  alertThreshold: string;
}

export interface BudgetCategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
}

export interface BudgetUsageDto {
  spentAmount: string;
  remainingAmount: string;
  usagePercentage: string;
  transactionCount: number;
  lastTransactionAt: BusinessDate | null;
  timeStatus: BudgetTimeStatus;
  status: BudgetUsageStatus;
}

export interface BudgetResponseDto {
  id: string;
  name: string;
  amount: string;
  currency: string;
  type: BudgetType;
  period: BudgetPeriod;
  categoryId: string | null;
  startDate: BusinessDate;
  endDate: BusinessDate;
  alertThreshold: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: BudgetCategoryDto | null;
  usage: BudgetUsageDto;
}
