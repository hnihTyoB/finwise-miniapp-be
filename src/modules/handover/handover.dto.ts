export type HandoverStatus =
  | 'PENDING_CLAIM'
  | 'CLAIMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface HandoverSessionData {
  handoverToken: string;
  signature: string;
  pinCode: string;
  otpCode: string;
  sourceUserId: string;
  sourceUserEmail: string | null;
  sourceUserName: string | null;
  status: HandoverStatus;
  targetUserId: string | null;
  targetUserName: string | null;
  failedAttempts: number;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  transferredRecords?: TransferredRecordCounts;
}

export interface TransferredRecordCounts {
  [key: string]: any;
  wallets: number;
  categories: number;
  transactions: number;
  transfers: number;
  budgets: number;
  savingGoals: number;
  recurringSchedules: number;
  reminders: number;
}

export interface InitiateHandoverResponseDto {
  handoverToken: string;
  signature: string;
  pinCode: string;
  expiresIn: number;
  expiresAt: string;
  qrPayload: string;
  qrDataUrl?: string;
}

export interface ClaimHandoverDto {
  handoverToken?: string;
  signature?: string;
  pinCode?: string;
}

export interface ClaimHandoverResponseDto {
  handoverToken: string;
  sourceUserName: string;
  status: HandoverStatus;
}

export interface ConfirmHandoverDto {
  handoverToken: string;
  otp: string;
}

export interface ConfirmHandoverResponseDto {
  status: HandoverStatus;
  targetUserId: string;
  targetUserName: string;
  transferredRecords: TransferredRecordCounts;
}

export interface HandoverStatusResponseDto {
  handoverToken: string;
  status: HandoverStatus;
  pinCode: string;
  expiresIn: number;
  targetUserId?: string | null;
  targetUserName?: string | null;
  otpPrompt?: string;
  otpCodeDev?: string; // in dev/test only
}

export interface HandoverResultResponseDto {
  handoverToken: string;
  status: HandoverStatus;
  sourceUserName?: string | null;
  completedAt?: string;
  transferredRecords?: TransferredRecordCounts;
}
