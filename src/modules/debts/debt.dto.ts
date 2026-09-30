import {
  DebtType,
  AmortizationMethod,
  DebtStatus,
} from '@prisma/client';
import { BusinessDate } from '../../common/date-time/business-time';

export interface PreviewAmortizationScheduleDto {
  principal: number;
  annualInterestRate: number;
  termMonths: number;
  startDate: BusinessDate;
  method: AmortizationMethod;
}

export interface CreateDebtContractDto {
  name: string;
  counterparty: string;
  type: DebtType;
  method: AmortizationMethod;
  principal: number;
  annualInterestRate: number;
  termMonths: number;
  startDate: BusinessDate;
  walletId?: string | null;
  notes?: string | null;
}

export interface UpdateDebtContractDto {
  name?: string;
  counterparty?: string;
  walletId?: string | null;
  notes?: string | null;
}

export interface DebtContractQueryDto {
  type?: DebtType;
  status?: DebtStatus;
  isArchived?: boolean;
  page: number;
  limit: number;
}

export interface PayInstallmentDto {
  walletId?: string;
  paidDate?: BusinessDate;
  notes?: string;
}

export interface EarlySettlementDto {
  walletId?: string;
  paidDate?: BusinessDate;
  penaltyFee?: number;
  notes?: string;
}

