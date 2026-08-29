export interface UserQueryDto {
  email?: string;
  fullName?: string;
  roleName?: string;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'email' | 'fullName';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateUserDto {
  email: string;
  password: string;
  roleId: string;
  fullName?: string;
}

export interface UpdateUserDto {
  isActive?: boolean;
  roleId?: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  roleId: string;
  role?: {
    id: string;
    name: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminStatsDto {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  deletedUsers: number;
  totalRoles: number;
}
