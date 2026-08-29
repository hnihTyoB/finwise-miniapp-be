export interface CreateRoleDto {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
}

export interface RoleQueryDto {
  name?: string;
  isSystem?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface AssignRolePermissionsDto {
  permissionIds: string[];
}

export interface PermissionQueryDto {
  resource?: string;
  action?: string;
  search?: string;
}

export interface AuditLogQueryDto {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface UserRoleUpdateDto {
  roleId: string;
}
