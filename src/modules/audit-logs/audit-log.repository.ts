import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { AuditLogQueryDto, CreateAuditLogDto } from './audit-log.dto';

export class AuditLogRepository {
  async createAuditLog(data: CreateAuditLogDto) {
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
    const {
      actorId,
      action,
      targetType,
      targetId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

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

export const auditLogRepository = new AuditLogRepository();
