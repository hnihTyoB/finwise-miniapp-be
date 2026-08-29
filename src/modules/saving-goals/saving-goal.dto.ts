import { SavingGoalStatus } from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export type SavingGoalSortField =
  'name' | 'targetAmount' | 'targetDate' | 'createdAt' | 'updatedAt';
export type SavingContributionSortField =
  'amount' | 'contributedAt' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface SavingGoalQueryDto {
  search?: string;
  status?: SavingGoalStatus;
  dueFrom?: BusinessDate;
  dueTo?: BusinessDate;
  includeArchived: boolean;
  sortBy: SavingGoalSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateSavingGoalDto {
  name: string;
  targetAmount: string;
  currency: string;
  targetDate: BusinessDate;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateSavingGoalDto {
  name?: string;
  targetAmount?: string;
  currency?: string;
  targetDate?: BusinessDate;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  status?: Extract<SavingGoalStatus, 'ACTIVE' | 'PAUSED'>;
}

export interface SavingContributionQueryDto {
  dateFrom?: BusinessDate;
  dateTo?: BusinessDate;
  sortBy: SavingContributionSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateSavingContributionDto {
  amount: string;
  contributedAt: Date;
  note?: string | null;
}

export interface UpdateSavingContributionDto {
  amount?: string;
  contributedAt?: Date;
  note?: string | null;
}

export interface SavingGoalProgressDto {
  savedAmount: string;
  remainingAmount: string;
  progressPercentage: string;
  contributionCount: number;
  lastContributionAt: Date | null;
  daysRemaining: number;
  isOverdue: boolean;
}

export interface SavingGoalResponseDto {
  id: string;
  name: string;
  targetAmount: string;
  currency: string;
  targetDate: BusinessDate;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: SavingGoalStatus;
  completedAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  progress: SavingGoalProgressDto;
}

export interface SavingContributionResponseDto {
  id: string;
  savingGoalId: string;
  amount: string;
  contributedAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}
