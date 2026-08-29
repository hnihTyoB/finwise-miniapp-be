import { TransactionType } from '@prisma/client';

export type CategorySource = 'ALL' | 'SYSTEM' | 'USER';
export type CategorySortField = 'name' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface CategoryQueryDto {
  search?: string;
  type?: TransactionType;
  source: CategorySource;
  parentId?: string | null;
  includeArchived: boolean;
  sortBy: CategorySortField;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface CategoryTreeQueryDto {
  search?: string;
  type?: TransactionType;
  source: CategorySource;
  includeArchived: boolean;
}

export interface CreateCategoryDto {
  name: string;
  type: TransactionType;
  parentId?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateCategoryDto {
  name?: string;
  type?: TransactionType;
  parentId?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface CategoryResponseDto {
  id: string;
  parentId: string | null;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryTreeNodeDto extends CategoryResponseDto {
  children: CategoryTreeNodeDto[];
}

