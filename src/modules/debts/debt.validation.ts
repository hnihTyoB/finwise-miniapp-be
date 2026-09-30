import { z } from 'zod';
import { assertBusinessDate } from '../../common/date-time/business-time';

const debtTypeSchema = z.enum(['DEBT_PAYABLE', 'LOAN_RECEIVABLE']);
const amortizationMethodSchema = z.enum([
  'REDUCING_BALANCE',
  'FIXED_ANNUITY',
  'INTEREST_ONLY',
]);
const debtStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'OVERDUE',
  'COMPLETED',
  'DEFAULTED',
  'CANCELLED',
]);

const principalSchema = z.coerce
  .number()
  .positive('Số tiền gốc phải lớn hơn 0')
  .max(100_000_000_000_000, 'Số tiền gốc tối đa là 100.000 tỷ VNĐ');

const annualInterestRateSchema = z.coerce
  .number()
  .min(0, 'Lãi suất năm không được âm')
  .max(100, 'Lãi suất năm tối đa là 100%');

const termMonthsSchema = z.coerce
  .number()
  .int('Số tháng phải là số nguyên')
  .min(1, 'Thời hạn tối thiểu là 1 tháng')
  .max(360, 'Thời hạn tối đa là 360 tháng');

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')
  .transform((value, context) => {
    try {
      return assertBusinessDate(value);
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  });

export const debtParamsSchema = z.object({
  id: z.string().uuid('ID khoản nợ không hợp lệ'),
});

export const previewAmortizationScheduleSchema = z.object({
  principal: principalSchema,
  annualInterestRate: annualInterestRateSchema,
  termMonths: termMonthsSchema,
  startDate: dateSchema,
  method: amortizationMethodSchema,
});

const optionalWalletIdSchema = z
  .union([z.string().uuid('ID ví không hợp lệ'), z.literal('')])
  .nullable()
  .optional()
  .transform((val) => (val === '' ? null : val));

const optionalNotesSchema = z
  .string()
  .trim()
  .max(2000, 'Ghi chú tối đa 2000 ký tự')
  .nullable()
  .optional()
  .transform((val) => (val === '' ? null : val));

export const createDebtContractSchema = z.object({
  name: z.string().trim().min(1, 'Tên khoản nợ không được để trống').max(255),
  counterparty: z.string().trim().min(1, 'Người/đơn vị liên quan không được để trống').max(255),
  type: debtTypeSchema,
  method: amortizationMethodSchema,
  principal: principalSchema,
  annualInterestRate: annualInterestRateSchema,
  termMonths: termMonthsSchema,
  startDate: dateSchema,
  walletId: optionalWalletIdSchema,
  notes: optionalNotesSchema,
});

export const updateDebtContractSchema = z.object({
  name: z.string().trim().min(1, 'Tên khoản nợ không được để trống').max(255).optional(),
  counterparty: z.string().trim().min(1, 'Người/đơn vị liên quan không được để trống').max(255).optional(),
  walletId: optionalWalletIdSchema,
  notes: optionalNotesSchema,
});

export const findDebtsQuerySchema = z.object({
  type: debtTypeSchema.optional(),
  status: debtStatusSchema.optional(),
  isArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const payInstallmentParamsSchema = z.object({
  id: z.string().uuid('ID khoản nợ không hợp lệ'),
  period: z.coerce.number().int().positive('Số kỳ phải là số nguyên dương'),
});

export const payInstallmentSchema = z.object({
  walletId: z.string().uuid('ID ví không hợp lệ').optional(),
  paidDate: dateSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const earlySettlementSchema = z.object({
  walletId: z.string().uuid('ID ví không hợp lệ').optional(),
  paidDate: dateSchema.optional(),
  penaltyFee: z.coerce
    .number()
    .min(0, 'Phí phạt trả trước không được âm')
    .optional()
    .default(0),
  notes: z.string().trim().max(500).optional(),
});

