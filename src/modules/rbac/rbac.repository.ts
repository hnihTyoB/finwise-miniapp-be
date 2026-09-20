import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { RoleQueryDto, PermissionQueryDto, AuditLogQueryDto } from './rbac.dto';
import { auditLogRepository } from '../audit-logs/audit-log.repository';
import { CreateAuditLogDto } from '../audit-logs/audit-log.dto';

export class RbacRepository {
  async findAllRoles(query: RoleQueryDto) {
    const { name, isSystem, page = 1, limit = 20, sortBy = 'createdAt', order = 'asc' } = query;

    const where: Prisma.RoleWhereInput = {
      ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
      ...(isSystem !== undefined ? { isSystem } : {}),
    };

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.role.findMany({
        where,
        include: {
          _count: {
            select: { users: true, rolePermissions: true },
          },
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.role.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findRoleById(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, rolePermissions: true },
        },
        rolePermissions: {
          include: {
            permission: true,
          },
          orderBy: [{ permission: { resource: 'asc' } }, { permission: { action: 'asc' } }],
        },
      },
    });
  }

  async findRoleByName(name: string) {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  async createRole(data: { name: string; description?: string; isSystem?: boolean; permissionIds?: string[] }) {
    const { name, description, isSystem = false, permissionIds = [] } = data;

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name,
          description,
          isSystem,
        },
      });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
    });
  }

  async updateRole(id: string, data: { name?: string; description?: string }) {
    return prisma.role.update({
      where: { id },
      data,
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async deleteRole(id: string) {
    return prisma.role.delete({
      where: { id },
    });
  }

  async findAllPermissions(query: PermissionQueryDto) {
    const { resource, action, search } = query;

    const where: Prisma.PermissionWhereInput = {
      ...(resource ? { resource } : {}),
      ...(action ? { action } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { resource: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.permission.findMany({
      where,
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findPermissionById(id: string) {
    return prisma.permission.findUnique({
      where: { id },
    });
  }

  async findPermissionsByIds(ids: string[]) {
    return prisma.permission.findMany({
      where: { id: { in: ids } },
    });
  }

  async getRolePermissions(roleId: string) {
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
      orderBy: [{ permission: { resource: 'asc' } }, { permission: { action: 'asc' } }],
    });
    return rolePermissions.map((rp) => rp.permission);
  }

  async getPermissionNamesByRoleId(roleId: string): Promise<string[]> {
    try {
      const rows = await prisma.$queryRaw<{ name: string }[]>`
        SELECT p.name
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ${roleId}::uuid
      `;
      return rows.map((r) => r.name);
    } catch {
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true },
      });
      return rolePermissions.map((rp) => rp.permission.name);
    }
  }

  async getUserRoleAndPermissions(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        isActive: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            isSystem: true,
          },
        },
      },
    });

    if (!user || !user.role) return null;

    const permissions = await this.getPermissionNamesByRoleId(user.roleId);

    return {
      userId: user.id,
      email: user.email,
      isActive: user.isActive,
      roleId: user.role.id,
      roleName: user.role.name,
      isSystemRole: user.role.isSystem,
      permissions,
    };
  }

  async assignRolePermissions(roleId: string, permissionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      // Remove existing permissions
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // Insert new permissions
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id: roleId },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
    });
  }

  async removeRolePermission(roleId: string, permissionId: string) {
    return prisma.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
  }

  async countUsersWithRole(roleId: string) {
    return prisma.user.count({
      where: { roleId, deletedAt: null, isActive: true },
    });
  }

  async countActiveAdminUsers(): Promise<number> {
    // Find roles that have ROLE_PERMISSION_ASSIGN or ROLE_UPDATE
    const adminRoles = await prisma.role.findMany({
      where: {
        rolePermissions: {
          some: {
            permission: {
              name: { in: ['ROLE_PERMISSION_ASSIGN', 'USER_UPDATE'] },
            },
          },
        },
      },
      select: { id: true },
    });

    const roleIds = adminRoles.map((r) => r.id);
    if (roleIds.length === 0) return 0;

    return prisma.user.count({
      where: {
        roleId: { in: roleIds },
        deletedAt: null,
        isActive: true,
      },
    });
  }

  async findRolesWithPermissions(permissionNames: string[]) {
    return prisma.role.findMany({
      where: {
        rolePermissions: {
          some: {
            permission: {
              name: { in: permissionNames },
            },
          },
        },
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
  }

  async updateUserRole(userId: string, roleId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: true },
    });
  }

  async createAuditLog(data: CreateAuditLogDto) {
    return auditLogRepository.createAuditLog(data);
  }

  async findAllAuditLogs(query: AuditLogQueryDto) {
    return auditLogRepository.findAllAuditLogs(query);
  }
}

export const rbacRepository = new RbacRepository();

