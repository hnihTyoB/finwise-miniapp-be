import { z } from 'zod';

export const exportBackupSchema = z.object({
  password: z
    .string()
    .min(6, 'Mật khẩu bảo vệ file sao lưu tối thiểu 6 ký tự')
    .max(100)
    .optional(),
});

export const backupWalletItemSchema = z.object({
  id: z.string().min(1, 'ID ví không được để trống'),
  name: z.string().min(1, 'Tên ví không được để trống').max(100),
  balance: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Số dư ví không hợp lệ'),
  currency: z.string().min(1).max(10).default('VND'),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const backupCategoryItemSchema = z.object({
  id: z.string().min(1, 'ID danh mục không được để trống'),
  name: z.string().min(1, 'Tên danh mục không được để trống').max(100),
  type: z.enum(['INCOME', 'EXPENSE'], {
    errorMap: () => ({ message: 'Loại danh mục phải là INCOME hoặc EXPENSE' }),
  }),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isSystem: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
});

export const backupTransactionItemSchema = z.object({
  id: z.string().min(1, 'ID giao dịch không được để trống'),
  walletId: z.string().min(1, 'Mã ví trong giao dịch không được để trống'),
  categoryId: z.string().min(1, 'Mã danh mục trong giao dịch không được để trống'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Số tiền giao dịch phải là số dương'),
  type: z.enum(['INCOME', 'EXPENSE']),
  description: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày giao dịch phải có định dạng YYYY-MM-DD'),
  createdAt: z.string().optional(),
});

export const backupTransferItemSchema = z.object({
  id: z.string().min(1, 'ID chuyển khoản không được để trống'),
  sourceWalletId: z.string().min(1, 'Mã ví nguồn không được để trống'),
  destinationWalletId: z.string().min(1, 'Mã ví đích không được để trống'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Số tiền chuyển khoản phải là số dương'),
  note: z.string().nullable().optional(),
  transferredAt: z.string(),
});

export const backupBudgetItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  name: z.string().min(1).max(100),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().min(1).max(10).default('VND'),
  type: z.enum(['OVERALL', 'CATEGORY']).default('CATEGORY'),
  period: z.enum(['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  alertThreshold: z.string().optional(),
  isArchived: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  autoRenew: z.boolean().optional(),
  rolloverMode: z.enum(['RESET', 'ROLLOVER_SURPLUS', 'ROLLOVER_DEFICIT', 'ROLLOVER_NET']).optional(),
  rolloverAmount: z.string().optional(),
  autoRenewUntil: z.string().nullable().optional(),
});

export const backupSavingContributionItemSchema = z.object({
  id: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  contributedAt: z.string(),
  note: z.string().nullable().optional(),
});

export const backupSavingGoalItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().min(1).max(10).default('VND'),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).default('ACTIVE'),
  completedAt: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  contributions: z.array(backupSavingContributionItemSchema).optional(),
});

export const backupDataPayloadSchema = z.object({
  wallets: z.array(backupWalletItemSchema).default([]),
  categories: z.array(backupCategoryItemSchema).default([]),
  transactions: z.array(backupTransactionItemSchema).default([]),
  transfers: z.array(backupTransferItemSchema).default([]),
  budgets: z.array(backupBudgetItemSchema).default([]),
  savingGoals: z.array(backupSavingGoalItemSchema).default([]),
});

export const backupFileStructureSchema = z.object({
  version: z.literal('1.0', {
    errorMap: () => ({ message: 'Phiên bản file sao lưu không được hỗ trợ (chỉ hỗ trợ 1.0)' }),
  }),
  appName: z.literal('FinWise', {
    errorMap: () => ({ message: 'Tệp không phải là định dạng sao lưu của ứng dụng FinWise' }),
  }),
  exportedAt: z.string(),
  isEncrypted: z.boolean().optional(),
  encryption: z
    .object({
      algorithm: z.string(),
      kdf: z.string(),
      iterations: z.number().int().positive(),
      salt: z.string(),
      iv: z.string(),
      tag: z.string(),
    })
    .optional(),
  ciphertext: z.string().optional(),
  checksum: z.string().min(16, 'Mã kiểm tra tính toàn vẹn (checksum) không hợp lệ'),
  data: backupDataPayloadSchema.optional(),
});

export const walletResolutionSchema = z.object({
  oldWalletId: z.string().min(1, 'Thiếu oldWalletId'),
  action: z.enum(['MERGE', 'CREATE_NEW']),
  targetWalletId: z.string().uuid().optional(),
  newWalletName: z.string().min(1).max(100).optional(),
});

export const importBackupSchema = z.object({
  walletResolutions: z.array(walletResolutionSchema).default([]),
  balanceMode: z.enum(['ACCUMULATE', 'MAINTAIN_CURRENT']).default('ACCUMULATE'),
  password: z.string().optional(),
});
