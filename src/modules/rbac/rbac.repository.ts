import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { RoleQueryDto, PermissionQueryDto, AuditLogQueryDto } from './rbac.dto';

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

  async createAuditLog(data: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    previousState?: any;
    newState?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        previousState: data.previousState ? JSON.stringify(data.previousState) : undefined,
        newState: data.newState ? JSON.stringify(data.newState) : undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async findAllAuditLogs(query: AuditLogQueryDto) {
    const { actorId, action, targetType, targetId, dateFrom, dateTo, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = query;

    const where: Prisma.AuditLogWhereInput = {
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const actorIds = data.flatMap((log) => (log.actorId ? [log.actorId] : []));
    const userTargetIds = data.flatMap((log) =>
      log.targetType === 'USER' && log.targetId ? [log.targetId] : []
    );
    const roleTargetIds = data.flatMap((log) =>
      log.targetType === 'ROLE' && log.targetId ? [log.targetId] : []
    );
    const permissionTargetIds = data.flatMap((log) =>
      log.targetType === 'PERMISSION' && log.targetId ? [log.targetId] : []
    );

    const [users, roles, permissions] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: [...new Set([...actorIds, ...userTargetIds])] } },
        select: { id: true, email: true },
      }),
      prisma.role.findMany({
        where: { id: { in: [...new Set(roleTargetIds)] } },
        select: { id: true, name: true },
      }),
      prisma.permission.findMany({
        where: { id: { in: [...new Set(permissionTargetIds)] } },
        select: { id: true, name: true },
      }),
    ]);

    const userEmailById = new Map(users.map((user) => [user.id, user.email]));
    const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
    const permissionNameById = new Map(permissions.map((permission) => [permission.id, permission.name]));

    const enrichedData = data.map((log) => {
      let targetLabel: string | null = null;
      if (log.targetId) {
        if (log.targetType === 'USER') targetLabel = userEmailById.get(log.targetId) ?? null;
        if (log.targetType === 'ROLE') targetLabel = roleNameById.get(log.targetId) ?? null;
        if (log.targetType === 'PERMISSION') targetLabel = permissionNameById.get(log.targetId) ?? null;
      }

      return {
        ...log,
        actorEmail: log.actorId ? userEmailById.get(log.actorId) ?? null : null,
        targetLabel,
      };
    });

    return {
      data: enrichedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const rbacRepository = new RbacRepository();

