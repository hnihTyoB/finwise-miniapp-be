import bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { UserQueryDto, CreateUserDto, UpdateUserDto } from './user.dto';
import { rbacService } from '../rbac/rbac.service';
import { RbacRepository } from '../rbac/rbac.repository';

export class UserService {
  private readonly repository = new UserRepository();
  private readonly rbacRepository = new RbacRepository();

  async findAll(query: UserQueryDto) {
    return this.repository.findAll(query);
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);

    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return user;
  }

  async create(data: CreateUserDto) {
    const existing = await this.repository.findByEmail(data.email);

    if (existing) {
      throw new AppError('Email already exists', 409, ERROR_CODE.DUPLICATE_ENTRY);
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    return this.repository.create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      roleId: data.roleId,
      isActive: true, // Admin-created users are active by default
    });
  }

  async update(
    id: string,
    data: UpdateUserDto,
    actorId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const user = await this.findById(id);

    const roleChanged = Boolean(data.roleId && data.roleId !== user.roleId);

    // If role is changing, delegate to rbacService for safety checks
    if (roleChanged && data.roleId) {
      await rbacService.updateUserRole(id, data.roleId, actorId, metadata);
    }

    // If deactivating user, check last admin protection
    if (data.isActive === false && user.isActive) {
      const userRBAC = await this.rbacRepository.getUserRoleAndPermissions(id);
      const isAdmin = userRBAC?.permissions.includes('ROLE_PERMISSION_ASSIGN') || userRBAC?.permissions.includes('USER_UPDATE');
      if (isAdmin) {
        const activeAdminCount = await this.rbacRepository.countActiveAdminUsers();
        if (activeAdminCount <= 1) {
          throw new AppError('Không thể vô hiệu hóa tài khoản quản trị viên hoạt động duy nhất', 400, ERROR_CODE.LAST_ADMIN_PROTECTED);
        }
      }
    }

    const updatePayload: { isActive?: boolean; roleId?: string } = {};
    if (data.isActive !== undefined && data.isActive !== user.isActive) {
      updatePayload.isActive = data.isActive;
    }
    if (data.roleId !== undefined && !roleChanged && data.roleId !== user.roleId) {
      updatePayload.roleId = data.roleId;
    }

    const updated = Object.keys(updatePayload).length > 0
      ? await this.repository.update(id, updatePayload)
      : await this.findById(id);

    await rbacService.invalidateUserCache(id);

    // Audit log for status change
    if (data.isActive !== undefined && data.isActive !== user.isActive) {
      await this.rbacRepository.createAuditLog({
        actorId,
        action: data.isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
        targetType: 'USER',
        targetId: id,
        previousState: { isActive: user.isActive },
        newState: { isActive: data.isActive },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      });
    }

    return updated;
  }

  async softDelete(
    id: string,
    adminId: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    const user = await this.findById(id);

    const userRBAC = await this.rbacRepository.getUserRoleAndPermissions(id);
    const isAdmin = userRBAC?.permissions.includes('ROLE_PERMISSION_ASSIGN') || userRBAC?.permissions.includes('USER_UPDATE');
    if (isAdmin) {
      const activeAdminCount = await this.rbacRepository.countActiveAdminUsers();
      if (activeAdminCount <= 1) {
        throw new AppError('Không thể xóa tài khoản quản trị viên hoạt động duy nhất', 400, ERROR_CODE.LAST_ADMIN_PROTECTED);
      }
    }

    const result = await this.repository.softDelete(id, adminId);
    await rbacService.invalidateUserCache(id);

    await this.rbacRepository.createAuditLog({
      actorId: adminId,
      action: 'USER_DELETE',
      targetType: 'USER',
      targetId: id,
      previousState: { email: user.email, fullName: user.fullName, isActive: user.isActive },
      newState: { deletedAt: new Date().toISOString() },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    return result;
  }

  async restore(
    id: string,
    actorId: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    // Look for soft-deleted user
    const user = await this.repository.findDeletedById(id);
    if (!user) {
      // Try active user (not deleted) - return conflict
      const activeUser = await this.repository.findById(id);
      if (activeUser) {
        throw new AppError('Người dùng chưa bị xóa, không cần khôi phục', 400, ERROR_CODE.VALIDATION_ERROR);
      }
      throw new AppError('Người dùng không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    const restored = await this.repository.restore(id);
    await rbacService.invalidateUserCache(id);

    await this.rbacRepository.createAuditLog({
      actorId,
      action: 'USER_RESTORE',
      targetType: 'USER',
      targetId: id,
      previousState: { deletedAt: user.deletedAt?.toISOString() },
      newState: { isActive: true, deletedAt: null },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    return restored;
  }

  async getAdminStats() {
    return this.repository.getAdminStats();
  }
}
