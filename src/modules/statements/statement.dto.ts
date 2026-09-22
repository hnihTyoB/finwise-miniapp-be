import { StatementExportFormat, StatementJobStatus } from '@prisma/client';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export interface CreateStatementExportDto {
  walletId?: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD (exclusive)
  format: StatementExportFormat;
  password?: string;
  passwordHint?: string;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export interface StatementJobResponseDto {
  jobId: string;
  userId: string;
  walletId: string | null;
  format: StatementExportFormat;
  status: StatementJobStatus;
  dateFrom: string;
  dateTo: string;
  isPasswordProtected: boolean;
  passwordHint: string | null;
  downloadUrl: string | null;
  fileSize: number | null;
  recordCount: number | null;
  expiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  checkStatusUrl: string;
}

export interface StatementVerifyResponseDto {
  isValid: boolean;
  verificationCode: string;
  userName: string | null;
  walletName: string | null;
  period: string;
  recordCount: number | null;
  issuedAt: string | null;
  status: StatementJobStatus;
}

// ─── Internal types used by the worker/exporters ─────────────────────────────

export interface ExportTransactionRow {
  id: string;
  date: Date;
  walletName: string;
  currency: string;
  categoryName: string;
  categoryType: 'INCOME' | 'EXPENSE';
  amount: string; // Decimal.toFixed(2)
  description: string | null;
  location: string | null;
}

export interface ExportSummary {
  openingBalance: string;    // balance before dateFrom
  totalIncome: string;
  totalExpense: string;
  netSavings: string;
  closingBalance: string;    // openingBalance + net
  recordCount: number;
  currency: string;
  dateFrom: Date;
  dateTo: Date;
  userName: string | null;
  walletName: string | null;
}
