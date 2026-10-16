export type WalletSortField = 'name' | 'balance' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';
export type WalletType = 'STANDARD' | 'SAVINGS_ACCOUNT';

export interface WalletQueryDto {
  includeArchived: boolean;
  type?: WalletType;
  scope?: 'ALL' | 'PERSONAL' | 'SHARED';
  sortBy: WalletSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateWalletDto {
  name: string;
  balance?: string;
  currency?: string;
  type?: WalletType;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  isDefault?: boolean;
}

export interface UpdateWalletDto {
  name?: string;
  balance?: string;
  currency?: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

export interface WalletMemberSummaryDto {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface WalletResponseDto {
  id: string;
  name: string;
  balance: string;
  currency: string;
  type: WalletType;
  icon: string | null;
  color: string | null;
  description: string | null;
  isDefault: boolean;
  isArchived: boolean;
  isShared?: boolean;
  myRole?: 'OWNER' | 'MEMBER' | 'VIEWER';
  membersCount?: number;
  membersSummary?: WalletMemberSummaryDto[];
  termDepositId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletListResponseDto {
  data: WalletResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
