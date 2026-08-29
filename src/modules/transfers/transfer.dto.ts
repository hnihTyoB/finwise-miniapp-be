export type TransferSortField = 'amount' | 'transferredAt' | 'createdAt';
export type TransferSortOrder = 'asc' | 'desc';

export interface TransferQueryDto {
  search?: string;
  walletId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: TransferSortField;
  order: TransferSortOrder;
  page: number;
  limit: number;
}

export interface CreateTransferDto {
  sourceWalletId: string;
  destinationWalletId: string;
  amount: string;
  note?: string | null;
  transferredAt: Date;
}

export interface TransferWalletDto {
  id: string;
  name: string;
  currency: string;
  icon: string | null;
  color: string | null;
}

export interface TransferResponseDto {
  id: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: string;
  note: string | null;
  transferredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  sourceWallet: TransferWalletDto;
  destinationWallet: TransferWalletDto;
}

export interface TransferListResponseDto {
  data: TransferResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
