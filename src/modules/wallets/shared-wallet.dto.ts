import { WalletMemberRole, WalletMemberStatus, WalletInvitationStatus } from '@prisma/client';

export interface CreateInvitationDto {
  role?: WalletMemberRole;
  expireDays?: number;
}

export interface AcceptInvitationDto {
  inviteCode: string;
  nickname?: string;
}

export interface UpdateMemberDto {
  role?: WalletMemberRole;
  nickname?: string;
  monthlySpendingLimit?: string | null;
}

export interface InvitationResponseDto {
  id: string;
  walletId: string;
  walletName: string;
  inviterName: string;
  role: WalletMemberRole;
  inviteCode: string;
  qrCodeDataUrl: string;
  expiresAt: string;
  status: WalletInvitationStatus;
  createdAt: string;
}

export interface InvitationPreviewResponseDto {
  walletId: string;
  walletName: string;
  currency: string;
  inviterName: string;
  inviterAvatarUrl: string | null;
  role: WalletMemberRole;
  membersCount: number;
  expiresAt: string;
}

export interface WalletMemberResponseDto {
  id: string;
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  user?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
  role: WalletMemberRole;
  nickname: string | null;
  monthlySpendingLimit: string | null;
  currentMonthSpent: string;
  status: WalletMemberStatus;
  joinedAt: string;
}

export interface MemberSpendingBreakdownItem {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  nickname: string | null;
  role: WalletMemberRole;
  spentAmount: string;
  totalSpent?: string;
  percentage: number;
  spendingPercentage?: string;
  transactionCount: number;
  monthlyLimit: string | null;
  limitUsagePercentage: number | null;
}

export interface MemberSettlementItem {
  userId: string;
  fullName: string | null;
  totalInjected: string;
  totalSpent: string;
  netBalance: string;
}

export interface SharedWalletAnalyticsDto {
  walletId: string;
  walletName: string;
  currency: string;
  period: {
    from: string;
    to: string;
  };
  totalIncome: string;
  totalExpense: string;
  totalSpent?: string;
  currentBalance: string;
  memberBreakdown: MemberSpendingBreakdownItem[];
  settlementSummary: MemberSettlementItem[];
}
