export type WalletSortField = 'name' | 'balance' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface WalletQueryDto {
  includeArchived: boolean;
  sortBy: WalletSortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CreateWalletDto {
  name: string;
  balance?: string;
  currency?: string;
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

export interface WalletResponseDto {
  id: string;
  name: string;
  balance: string;
  currency: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  isDefault: boolean;
  isArchived: boolean;
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
