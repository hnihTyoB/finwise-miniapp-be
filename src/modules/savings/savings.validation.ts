import { z } from 'zod';
import { TermDepositRolloverMethod, TermDepositStatus } from '@prisma/client';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const amountRegex = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const rateRegex = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;

export const termDepositQuerySchema = z.object({
  status: z.nativeEnum(TermDepositStatus).optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['startDate', 'maturityDate', 'principalAmount', 'interestRate', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTermDepositSchema = z.object({
  name: z.string().trim().min(1, 'Tên sổ tiết kiệm không được để trống').max(100, 'Tên sổ tiết kiệm tối đa 100 ký tự'),
  bankName: z.string().trim().min(1, 'Tên ngân hàng không được để trống').max(100, 'Tên ngân hàng tối đa 100 ký tự'),
  accountNumber: z.string().trim().max(100).optional(),
  principalAmount: z
    .string()
    .trim()
    .regex(amountRegex, 'Số tiền gửi không hợp lệ')
    .refine((val) => Number(val) > 0, 'Số tiền gửi phải lớn hơn 0'),
  interestRate: z
    .string()
    .trim()
    .regex(rateRegex, 'Lãi suất không hợp lệ')
    .refine((val) => Number(val) > 0 && Number(val) <= 100, 'Lãi suất phải trong khoảng từ 0.01% đến 100%/năm'),
  termMonths: z.coerce.number().int().min(1, 'Kỳ hạn tối thiểu 1 tháng').max(120, 'Kỳ hạn tối đa 120 tháng'),
  startDate: z.string().regex(dateRegex, 'Ngày gửi phải theo định dạng YYYY-MM-DD').optional(),
  rolloverMethod: z.nativeEnum(TermDepositRolloverMethod).default(TermDepositRolloverMethod.ROLLOVER_ALL),
  targetWalletId: z.string().uuid('ID ví nhận tiền không hợp lệ').optional(),
  sourceWalletId: z.string().uuid('ID ví nguồn trích tiền không hợp lệ').optional(),
  nonTermRate: z
    .string()
    .trim()
    .regex(rateRegex, 'Lãi suất không kỳ hạn không hợp lệ')
    .optional(),
  notes: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').optional(),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Mã màu không hợp lệ').optional(),
  icon: z.string().min(1).optional(),
}).refine(
  (data) => {
    if (
      (data.rolloverMethod === TermDepositRolloverMethod.ROLLOVER_PRINCIPAL ||
        data.rolloverMethod === TermDepositRolloverMethod.SETTLE_TO_WALLET) &&
      !data.targetWalletId
    ) {
      return false;
    }
    return true;
  },
  {
    message: 'Vui lòng chọn ví nhận tiền khi chọn phương thức nhận lãi hoặc tất toán về ví',
    path: ['targetWalletId'],
  },
);

export const updateTermDepositSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  bankName: z.string().trim().min(1).max(100).optional(),
  accountNumber: z.string().trim().max(100).nullable().optional(),
  interestRate: z
    .string()
    .trim()
    .regex(rateRegex)
    .refine((val) => Number(val) > 0 && Number(val) <= 100)
    .optional(),
  rolloverMethod: z.nativeEnum(TermDepositRolloverMethod).optional(),
  targetWalletId: z.string().uuid().nullable().optional(),
  nonTermRate: z.string().trim().regex(rateRegex).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  icon: z.string().min(1).optional(),
});

export const settleTermDepositSchema = z.object({
  targetWalletId: z.string().uuid('ID ví nhận tiền tất toán không hợp lệ'),
  settlementDate: z.string().regex(dateRegex, 'Ngày tất toán phải theo định dạng YYYY-MM-DD').optional(),
  isEarlyWithdrawal: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const termDepositParamsSchema = z.object({
  id: z.string().uuid('ID sổ tiết kiệm không hợp lệ'),
});

export const previewEarlyWithdrawalQuerySchema = z.object({
  date: z.string().regex(dateRegex, 'Ngày tính toán phải theo định dạng YYYY-MM-DD').optional(),
});

export const previewSavingsCalculationSchema = z.object({
  principalAmount: z
    .string()
    .trim()
    .regex(amountRegex, 'Số tiền gửi không hợp lệ')
    .refine((val) => Number(val) > 0, 'Số tiền gửi phải lớn hơn 0'),
  interestRate: z
    .string()
    .trim()
    .regex(rateRegex, 'Lãi suất không hợp lệ')
    .refine((val) => Number(val) > 0 && Number(val) <= 100, 'Lãi suất phải trong khoảng từ 0.01% đến 100%/năm'),
  termMonths: z.coerce.number().int().min(1).max(120),
  startDate: z.string().regex(dateRegex, 'Ngày gửi phải theo định dạng YYYY-MM-DD').optional(),
});
