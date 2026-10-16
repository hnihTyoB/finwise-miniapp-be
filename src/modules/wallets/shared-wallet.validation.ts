import { z } from 'zod';
import { WalletMemberRole } from '@prisma/client';

export const createInvitationSchema = z.object({
  role: z.enum([WalletMemberRole.MEMBER, WalletMemberRole.VIEWER]).default(WalletMemberRole.MEMBER).optional(),
  expireDays: z.coerce.number().int().min(1).max(30).default(7).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7).optional(),
}).transform((data) => ({
  role: data.role || WalletMemberRole.MEMBER,
  expiresInDays: data.expiresInDays || data.expireDays || 7,
}));

export const acceptInvitationSchema = z.object({
  inviteCode: z.string().trim().min(4, 'Mã mời phải có ít nhất 4 ký tự').max(32),
  nickname: z.string().trim().max(50).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum([WalletMemberRole.MEMBER, WalletMemberRole.VIEWER]).optional(),
  nickname: z.string().trim().max(50).nullable().optional(),
  monthlySpendingLimit: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Hạn mức chi tiêu không hợp lệ')
    .nullable()
    .optional(),
});

export const walletIdParamSchema = z.object({
  id: z.string().uuid('ID ví không hợp lệ'),
});

export const memberIdParamSchema = z.object({
  id: z.string().uuid('ID ví không hợp lệ'),
  memberId: z.string().uuid('ID thành viên không hợp lệ'),
});

export const previewCodeParamSchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export const cancelInvitationParamsSchema = z.object({
  id: z.string().uuid('ID ví không hợp lệ'),
  inviteId: z.string().uuid('ID mã mời không hợp lệ'),
});

export const sharedWalletAnalyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày bắt đầu YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày kết thúc YYYY-MM-DD').optional(),
});
