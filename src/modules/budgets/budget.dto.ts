import {
  BudgetPeriod,
  BudgetRolloverMode,
  BudgetType,
  TransactionType,
} from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export { BudgetRolloverMode };

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
  isRecurring?: boolean;
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
  isRecurring?: boolean;
  autoRenew?: boolean;
  rolloverMode?: BudgetRolloverMode;
  autoRenewUntil?: BusinessDate | null;
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
  isRecurring?: boolean;
  autoRenew?: boolean;
  rolloverMode?: BudgetRolloverMode;
  autoRenewUntil?: BusinessDate | null;
}

export interface ToggleAutoRenewDto {
  autoRenew: boolean;
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
  isRecurring?: boolean;
  autoRenew?: boolean;
  recurrenceGroupId?: string | null;
  rolloverMode?: BudgetRolloverMode;
  rolloverAmount?: string;
  autoRenewUntil?: BusinessDate | null;
  renewedAt?: Date | null;
  parentBudgetId?: string | null;
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
  userId: string;
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
  isRecurring: boolean;
  autoRenew: boolean;
  recurrenceGroupId: string | null;
  rolloverMode: BudgetRolloverMode;
  rolloverAmount: string;
  autoRenewUntil: BusinessDate | null;
  renewedAt: Date | null;
  parentBudgetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: BudgetCategoryDto | null;
  usage: BudgetUsageDto;
}
