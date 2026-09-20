import { RbacRepository } from './rbac.repository';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { SYSTEM_ROLES } from '../../common/constants';
import { cacheService } from '../../common/services/cache.service';
import { LoggerService } from '../../common/services/logger.service';
import {
  CreateRoleDto,
  UpdateRoleDto,
  RoleQueryDto,
  PermissionQueryDto,
} from './rbac.dto';

const CACHE_TTL_SECONDS = 300; // 5 minutes

export class RbacService {
  private readonly repository = new RbacRepository();
  private readonly logger = new LoggerService('RbacService');

  // ==========================================
  // ROLES MANAGEMENT
  // ==========================================

  async findAllRoles(query: RoleQueryDto) {
    return this.repository.findAllRoles(query);
  }

  async findRoleById(id: string) {
    const role = await this.repository.findRoleById(id);
    if (!role) {
      throw new AppError('Vai trò không tồn tại', 404, ERROR_CODE.ROLE_NOT_FOUND);
    }
    return role;
  }

  async createRole(
    data: CreateRoleDto,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const existing = await this.repository.findRoleByName(data.name);
    if (existing) {
      throw new AppError(`Tên vai trò "${data.name}" đã tồn tại`, 409, ERROR_CODE.DUPLICATE_ENTRY);
    }

    if (data.permissionIds && data.permissionIds.length > 0) {
      const validPermissions = await this.repository.findPermissionsByIds(data.permissionIds);
      if (validPermissions.length !== data.permissionIds.length) {
        throw new AppError('Một hoặc nhiều quyền hạn không hợp lệ', 400, ERROR_CODE.PERMISSION_NOT_FOUND);
      }
    }

    const createdRole = await this.repository.createRole({
      name: data.name,
      description: data.description,
      isSystem: false,
      permissionIds: data.permissionIds,
    });

    await this.repository.createAuditLog({
      actorId,
      action: 'ROLE_CREATE',
      targetType: 'ROLE',
      targetId: createdRole?.id,
      newState: createdRole,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`Role "${data.name}" created by actor ${actorId || 'system'}`);
    return createdRole;
  }

  async updateRole(
    id: string,
    data: UpdateRoleDto,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const role = await this.findRoleById(id);

    // Check if fields are unchanged
    const isNameSame = data.name === undefined || data.name === role.name;
    const isDescSame =
      data.description === undefined ||
      data.description === role.description ||
      (!data.description && !role.description);

    if (isNameSame && isDescSame) {
      this.logger.info(`Role "${role.name}" (ID: ${id}) fields unchanged, skipping update and audit log`);
      return role;
    }

    // Protected: cannot rename ADMIN or SUPER_ADMIN system roles
    if (
      role.isSystem &&
      [SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.SUPER_ADMIN].includes(role.name as any) &&
      data.name &&
      data.name !== role.name
    ) {
      throw new AppError(`Không thể đổi tên vai trò hệ thống "${role.name}"`, 400, ERROR_CODE.ROLE_SYSTEM_PROTECTED);
    }

    if (data.name && data.name !== role.name) {
      const existing = await this.repository.findRoleByName(data.name);
      if (existing && existing.id !== id) {
        throw new AppError(`Tên vai trò "${data.name}" đã tồn tại`, 409, ERROR_CODE.DUPLICATE_ENTRY);
      }
    }

    const updatedRole = await this.repository.updateRole(id, data);

    // Invalidate caches
    await this.invalidateRoleCache(id);

    await this.repository.createAuditLog({
      actorId,
      action: 'ROLE_UPDATE',
      targetType: 'ROLE',
      targetId: id,
      previousState: { name: role.name, description: role.description },
      newState: { name: updatedRole.name, description: updatedRole.description },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`Role "${role.name}" (ID: ${id}) updated by actor ${actorId || 'system'}`);
    return updatedRole;
  }

  async deleteRole(
    id: string,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const role = await this.findRoleById(id);

    if (role.isSystem) {
      throw new AppError('Không thể xóa vai trò hệ thống được bảo vệ', 400, ERROR_CODE.ROLE_SYSTEM_PROTECTED);
    }

    const usersCount = await this.repository.countUsersWithRole(id);
    if (usersCount > 0) {
      throw new AppError(
        `Không thể xóa vai trò đang được gán cho ${usersCount} người dùng. Hãy chuyển người dùng sang vai trò khác trước.`,
        400,
        ERROR_CODE.ROLE_IN_USE
      );
    }

    await this.repository.deleteRole(id);

    // Invalidate caches
    await this.invalidateRoleCache(id);

    await this.repository.createAuditLog({
      actorId,
      action: 'ROLE_DELETE',
      targetType: 'ROLE',
      targetId: id,
      previousState: role,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`Role "${role.name}" (ID: ${id}) deleted by actor ${actorId || 'system'}`);
    return { success: true, message: `Vai trò "${role.name}" đã được xóa thành công` };
  }

  // ==========================================
  // PERMISSIONS & ASSIGNMENT
  // ==========================================

  async findAllPermissions(query: PermissionQueryDto) {
    return this.repository.findAllPermissions(query);
  }

  async getRolePermissions(roleId: string) {
    await this.findRoleById(roleId);
    return this.repository.getRolePermissions(roleId);
  }

  async assignRolePermissions(
    roleId: string,
    permissionIds: string[],
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const role = await this.findRoleById(roleId);

    // Verify all permission IDs exist
    if (permissionIds.length > 0) {
      const validPermissions = await this.repository.findPermissionsByIds(permissionIds);
      if (validPermissions.length !== permissionIds.length) {
        throw new AppError('Một hoặc nhiều quyền hạn không tồn tại', 400, ERROR_CODE.PERMISSION_NOT_FOUND);
      }
    }

    const uniqueNewIds = Array.from(new Set(permissionIds));
    const currentPermissionIds = (role.rolePermissions || []).map((rp) => rp.permissionId);
    const currentIdSet = new Set(currentPermissionIds);

    // If permissions are identical, skip database mutation and audit log
    const isUnchanged =
      uniqueNewIds.length === currentIdSet.size &&
      uniqueNewIds.every((id) => currentIdSet.has(id));

    if (isUnchanged) {
      this.logger.info(`Permissions for role "${role.name}" (ID: ${roleId}) unchanged, skipping update and audit log`);
      return role;
    }

    // Last Admin Protection: Check if removing critical permissions from the last admin role
    const criticalPermissions = ['ROLE_PERMISSION_ASSIGN', 'ROLE_UPDATE', 'USER_UPDATE'];
    const currentPermissionNames = (role.rolePermissions || []).map((rp) => rp.permission.name);
    const hasCriticalPerms = criticalPermissions.some((p) => currentPermissionNames.includes(p));

    if (hasCriticalPerms) {
      const newPermissions = await this.repository.findPermissionsByIds(uniqueNewIds);
      const newPermissionNames = newPermissions.map((p) => p.name);
      const willRetainCritical = criticalPermissions.some((p) => newPermissionNames.includes(p));

      if (!willRetainCritical) {
        // Check if other roles with active users retain these critical permissions
        const otherRoles = await this.repository.findRolesWithPermissions(criticalPermissions);
        const activeOtherRoles = otherRoles.filter((r) => r.id !== roleId && r._count.users > 0);

        if (activeOtherRoles.length === 0) {
          throw new AppError(
            'Không thể gỡ bỏ toàn bộ quyền quản trị tối cao (ROLE_PERMISSION_ASSIGN / ROLE_UPDATE) khỏi vai trò quản trị duy nhất',
            400,
            ERROR_CODE.LAST_ADMIN_PROTECTED
          );
        }
      }
    }

    const updatedRole = await this.repository.assignRolePermissions(roleId, uniqueNewIds);

    // Invalidate caches
    await this.invalidateRoleCache(roleId);

    await this.repository.createAuditLog({
      actorId,
      action: 'ROLE_PERMISSIONS_ASSIGN',
      targetType: 'ROLE',
      targetId: roleId,
      previousState: { permissions: currentPermissionNames },
      newState: { permissionIds: uniqueNewIds },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`Assigned ${uniqueNewIds.length} permissions to role "${role.name}" by actor ${actorId || 'system'}`);
    return updatedRole;
  }

  async removeRolePermission(
    roleId: string,
    permissionId: string,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const role = await this.findRoleById(roleId);
    const permission = await this.repository.findPermissionById(permissionId);
    if (!permission) {
      throw new AppError('Quyền hạn không tồn tại', 404, ERROR_CODE.PERMISSION_NOT_FOUND);
    }

    const currentPermissionIds = (role.rolePermissions || []).map((rp) => rp.permissionId);
    if (!currentPermissionIds.includes(permissionId)) {
      this.logger.info(`Role "${role.name}" (ID: ${roleId}) does not have permission "${permission.name}", skipping remove`);
      return { success: true, message: `Vai trò "${role.name}" không có quyền "${permission.name}"` };
    }

    // Last Admin Protection check
    if (['ROLE_PERMISSION_ASSIGN', 'ROLE_UPDATE', 'USER_UPDATE'].includes(permission.name)) {
      const otherRoles = await this.repository.findRolesWithPermissions([permission.name]);
      const activeOtherRoles = otherRoles.filter((r) => r.id !== roleId && r._count.users > 0);

      if (activeOtherRoles.length === 0) {
        throw new AppError(
          `Không thể gỡ bỏ quyền "${permission.name}" khỏi vai trò duy nhất có người dùng quản trị`,
          400,
          ERROR_CODE.LAST_ADMIN_PROTECTED
        );
      }
    }

    await this.repository.removeRolePermission(roleId, permissionId);

    // Invalidate caches
    await this.invalidateRoleCache(roleId);

    await this.repository.createAuditLog({
      actorId,
      action: 'ROLE_PERMISSION_REMOVE',
      targetType: 'ROLE',
      targetId: roleId,
      newState: { removedPermissionId: permissionId, permissionName: permission.name },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`Removed permission "${permission.name}" from role "${role.name}"`);
    return { success: true, message: `Đã gỡ quyền "${permission.name}" khỏi vai trò "${role.name}"` };
  }

  // ==========================================
  // USER ROLE ASSIGNMENT & SAFETY
  // ==========================================

  async updateUserRole(
    targetUserId: string,
    newRoleId: string,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const targetUser = await this.repository.getUserRoleAndPermissions(targetUserId);
    if (!targetUser) {
      throw new AppError('Người dùng không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    const newRole = await this.findRoleById(newRoleId);

    // If user already has this role, no-op
    if (targetUser.roleId === newRoleId) {
      return { success: true, message: 'Người dùng đã thuộc vai trò này' };
    }

    // Last Admin Protection: If target user is an active admin, check if they are the last one
    const targetIsAdmin = targetUser.permissions.includes('ROLE_PERMISSION_ASSIGN') || targetUser.permissions.includes('USER_UPDATE');
    if (targetIsAdmin) {
      const newRolePermissions = await this.repository.getPermissionNamesByRoleId(newRoleId);
      const newRoleIsAdmin = newRolePermissions.includes('ROLE_PERMISSION_ASSIGN') || newRolePermissions.includes('USER_UPDATE');

      if (!newRoleIsAdmin) {
        const activeAdminCount = await this.repository.countActiveAdminUsers();
        if (activeAdminCount <= 1) {
          throw new AppError(
            'Không thể chuyển vai trò của quản trị viên hoạt động duy nhất trong hệ thống',
            400,
            ERROR_CODE.LAST_ADMIN_PROTECTED
          );
        }
      }
    }

    const updatedUser = await this.repository.updateUserRole(targetUserId, newRoleId);

    // Invalidate user cache
    await this.invalidateUserCache(targetUserId);

    await this.repository.createAuditLog({
      actorId,
      action: 'USER_ROLE_UPDATE',
      targetType: 'USER',
      targetId: targetUserId,
      previousState: { roleId: targetUser.roleId, roleName: targetUser.roleName },
      newState: { roleId: newRoleId, roleName: newRole.name },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.info(`User ${targetUserId} role updated from "${targetUser.roleName}" to "${newRole.name}" by ${actorId || 'system'}`);
    return updatedUser;
  }

  // ==========================================
  // PERMISSION RESOLUTION & CACHING
  // ==========================================

  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `finwise:rbac:user:${userId}:permissions`;
    const cached = await cacheService.get<string[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const userRBAC = await this.repository.getUserRoleAndPermissions(userId);
    if (!userRBAC || !userRBAC.isActive) {
      return [];
    }

    const permissions = userRBAC.permissions;
    await cacheService.set(cacheKey, permissions, CACHE_TTL_SECONDS);
    return permissions;
  }

  async getRolePermissionsCached(roleId: string): Promise<string[]> {
    const cacheKey = `finwise:rbac:role:${roleId}:permissions`;
    const cached = await cacheService.get<string[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const permissions = await this.repository.getPermissionNamesByRoleId(roleId);
    await cacheService.set(cacheKey, permissions, CACHE_TTL_SECONDS);
    return permissions;
  }

  async invalidateRoleCache(roleId: string): Promise<void> {
    await cacheService.del(`finwise:rbac:role:${roleId}:permissions`);
    // Clear all user permission caches since users with this role need refreshed permissions
    await cacheService.clearPattern('finwise:rbac:user:*');
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await cacheService.del(`finwise:rbac:user:${userId}:permissions`);
    await cacheService.del(`finwise:user:status:${userId}`);
  }
}

export const rbacService = new RbacService();
