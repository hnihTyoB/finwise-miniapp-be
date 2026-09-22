export type TransactionTypeEnum = 'INCOME' | 'EXPENSE';
export type BudgetTypeEnum = 'OVERALL' | 'CATEGORY';
export type BudgetPeriodEnum = 'CUSTOM' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type BudgetRolloverModeEnum = 'RESET' | 'ROLLOVER_SURPLUS' | 'ROLLOVER_DEFICIT' | 'ROLLOVER_NET';
export type SavingGoalStatusEnum = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface BackupWalletItem {
  id: string;
  name: string;
  balance: string;
  currency: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  isDefault?: boolean;
  isArchived?: boolean;
}

export interface BackupCategoryItem {
  id: string;
  name: string;
  type: TransactionTypeEnum;
  icon?: string | null;
  color?: string | null;
  isSystem?: boolean;
  isArchived?: boolean;
  parentId?: string | null;
}

export interface BackupTransactionItem {
  id: string;
  walletId: string;
  categoryId: string;
  amount: string;
  type: TransactionTypeEnum;
  description?: string | null;
  receiptUrl?: string | null;
  location?: string | null;
  date: string; // YYYY-MM-DD
  createdAt?: string;
}

export interface BackupTransferItem {
  id: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: string;
  note?: string | null;
  transferredAt: string; // ISO
}

export interface BackupBudgetItem {
  id: string;
  categoryId?: string | null;
  name: string;
  amount: string;
  currency: string;
  type: BudgetTypeEnum;
  period: BudgetPeriodEnum;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  alertThreshold?: string;
  isArchived?: boolean;
  isRecurring?: boolean;
  autoRenew?: boolean;
  rolloverMode?: BudgetRolloverModeEnum;
  rolloverAmount?: string;
  autoRenewUntil?: string | null;
}

export interface BackupSavingContributionItem {
  id: string;
  amount: string;
  contributedAt: string; // ISO
  note?: string | null;
}

export interface BackupSavingGoalItem {
  id: string;
  name: string;
  targetAmount: string;
  currency: string;
  targetDate: string; // YYYY-MM-DD
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  status: SavingGoalStatusEnum;
  completedAt?: string | null;
  isArchived?: boolean;
  contributions?: BackupSavingContributionItem[];
}

export interface BackupDataPayload {
  wallets: BackupWalletItem[];
  categories: BackupCategoryItem[];
  transactions: BackupTransactionItem[];
  transfers: BackupTransferItem[];
  budgets: BackupBudgetItem[];
  savingGoals: BackupSavingGoalItem[];
}

export interface BackupFileStructure {
  version: string;
  appName: string;
  exportedAt: string;
  isEncrypted?: boolean;
  encryption?: {
    algorithm: string;
    kdf: string;
    iterations: number;
    salt: string;
    iv: string;
    tag: string;
  };
  ciphertext?: string;
  checksum: string;
  data?: BackupDataPayload;
}

export type WalletResolutionAction = 'MERGE' | 'CREATE_NEW';

export interface WalletResolution {
  oldWalletId: string;
  action: WalletResolutionAction;
  targetWalletId?: string; // required if action === 'MERGE'
  newWalletName?: string;  // optional custom name if action === 'CREATE_NEW'
}

export type BalanceResolutionMode = 'ACCUMULATE' | 'MAINTAIN_CURRENT';

export interface ImportBackupDto {
  walletResolutions: WalletResolution[];
  balanceMode: BalanceResolutionMode;
  password?: string;
}

export interface BackupPreviewCategoryMatch {
  id: string;
  name: string;
  type: TransactionTypeEnum;
  willMergeWithId: string | null;
  willMergeWithName: string | null;
  isNew: boolean;
}

export interface BackupPreviewWalletItem {
  id: string;
  name: string;
  balance: string;
  currency: string;
  icon?: string | null;
  color?: string | null;
  matchedExistingWalletId?: string | null;
  matchedExistingWalletName?: string | null;
}

export interface BackupPreviewResponseDto {
  fileVersion: string;
  exportedAt: string;
  isEncrypted: boolean;
  checksum: string;
  isChecksumValid: boolean;
  accountStatus: 'EMPTY' | 'HAS_DATA';
  existingWalletsCount: number;
  existingTransactionsCount: number;
  existingCategoriesCount: number;
  existingWallets: Array<{ id: string; name: string; balance: string; currency: string }>;
  summary: {
    walletsCount: number;
    categoriesCount: number;
    transactionsCount: number;
    transfersCount: number;
    budgetsCount: number;
    savingGoalsCount: number;
  };
  wallets: BackupPreviewWalletItem[];
  categoriesMatching: BackupPreviewCategoryMatch[];
  potentialDuplicatesCount: number;
}

export interface BackupImportResultDto {
  success: boolean;
  importedCount: {
    wallets: number;
    categories: number;
    transactions: number;
    transfers: number;
    budgets: number;
    savingGoals: number;
    savingContributions: number;
  };
  skippedDuplicates: {
    transactions: number;
    transfers: number;
  };
  balanceMode: BalanceResolutionMode;
  importedAt: string;
}

export interface ExportBackupOptionsDto {
  password?: string;
}
