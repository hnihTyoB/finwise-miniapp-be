import { TermDepositRolloverMethod, TermDepositStatus } from '@prisma/client';
import { AccruedInterestCalculation } from './services/savings-calculator.engine';

export type TermDepositSortField = 'startDate' | 'maturityDate' | 'principalAmount' | 'interestRate' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface TermDepositQueryDto {
  status?: TermDepositStatus;
  search?: string;
  sortBy?: TermDepositSortField;
  order?: SortOrder;
  page?: number;
  limit?: number;
}

export interface CreateTermDepositDto {
  name: string;
  bankName: string;
  accountNumber?: string;
  principalAmount: string;
  interestRate: string;
  termMonths: number;
  startDate?: string;
  rolloverMethod?: TermDepositRolloverMethod;
  targetWalletId?: string;
  sourceWalletId?: string; // Ví trích tiền mở sổ (nếu có)
  nonTermRate?: string;
  notes?: string;
  color?: string;
  icon?: string;
}

export interface UpdateTermDepositDto {
  name?: string;
  bankName?: string;
  accountNumber?: string | null;
  interestRate?: string;
  rolloverMethod?: TermDepositRolloverMethod;
  targetWalletId?: string | null;
  nonTermRate?: string;
  notes?: string | null;
  color?: string;
  icon?: string;
}

export interface SettleTermDepositDto {
  targetWalletId: string;
  settlementDate?: string;
  isEarlyWithdrawal?: boolean;
  notes?: string;
}

export interface TermDepositRolloverLogDto {
  id: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  principal: string;
  interestEarned: string;
  actionTaken: TermDepositRolloverMethod;
  createdAt: Date;
}

export interface TermDepositResponseDto {
  id: string;
  userId: string;
  walletId: string;
  walletName: string;
  bankName: string;
  accountNumber: string | null;
  principalAmount: string;
  interestRate: string;
  termMonths: number;
  startDate: string;
  maturityDate: string;
  rolloverMethod: TermDepositRolloverMethod;
  targetWalletId: string | null;
  targetWalletName: string | null;
  status: TermDepositStatus;
  estimatedInterest: string;
  actualInterest: string | null;
  nonTermRate: string;
  settledAt: Date | null;
  rolloverCount: number;
  lastRolloverAt: Date | null;
  isReminderSentT3: boolean;
  isReminderSentT0: boolean;
  notes: string | null;
  color: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
  accrued: AccruedInterestCalculation;
  isDueSoon: boolean; // True nếu còn <= 3 ngày
  rolloverLogs?: TermDepositRolloverLogDto[];
}

export interface SavingsSummaryDto {
  totalPrincipal: string;
  totalAccruedInterest: string;
  totalEstimatedInterest: string;
  activeCount: number;
  maturedCount: number;
  settledCount: number;
  dueSoonCount: number;
}

export interface TermDepositListResponseDto {
  data: TermDepositResponseDto[];
  summary: SavingsSummaryDto;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
