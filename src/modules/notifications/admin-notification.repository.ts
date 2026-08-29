import {
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  AdminDeliveryItemDto,
  AdminDeliveryQueryDto,
  AdminTemplateQueryDto,
  NotificationOverviewStatsDto,
  UpdateTemplateDto,
} from './admin-notification.dto';

export class AdminNotificationRepository {
  async getOverviewStats(
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<NotificationOverviewStatsDto> {
    const notificationWhere: Prisma.NotificationWhereInput = {};
    const deliveryWhere: Prisma.NotificationDeliveryWhereInput = {};

    if (dateFrom || dateTo) {
      notificationWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
      deliveryWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const [
      totalNotifications,
      totalRead,
      deliveryGrouped,
      typeGrouped,
    ] = await Promise.all([
      prisma.notification.count({ where: notificationWhere }),
      prisma.notification.count({
        where: { ...notificationWhere, readAt: { not: null } },
      }),
      prisma.notificationDelivery.groupBy({
        by: ['channel', 'status'],
        where: deliveryWhere,
        _count: { _all: true },
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where: notificationWhere,
        _count: { _all: true },
      }),
    ]);

    const totalUnread = totalNotifications - totalRead;

    let totalSent = 0;
    let totalPending = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const channels = Object.values(NotificationChannel);
    const channelMap = new Map<
      NotificationChannel,
      { total: number; sent: number; failed: number; pending: number; skipped: number }
    >();

    for (const ch of channels) {
      channelMap.set(ch, { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0 });
    }

    for (const group of deliveryGrouped) {
      const count = group._count._all;
      const chStats = channelMap.get(group.channel);
      if (chStats) {
        chStats.total += count;
        if (group.status === NotificationDeliveryStatus.SENT) {
          chStats.sent += count;
          totalSent += count;
        } else if (group.status === NotificationDeliveryStatus.FAILED) {
          chStats.failed += count;
          totalFailed += count;
        } else if (
          group.status === NotificationDeliveryStatus.PENDING ||
          group.status === NotificationDeliveryStatus.PROCESSING
        ) {
          chStats.pending += count;
          totalPending += count;
        } else if (group.status === NotificationDeliveryStatus.SKIPPED) {
          chStats.skipped += count;
          totalSkipped += count;
        }
      }
    }

    const finishedDeliveries = totalSent + totalFailed;
    const deliverySuccessRate =
      finishedDeliveries > 0
        ? Math.round((totalSent / finishedDeliveries) * 1000) / 10
        : 100;
    const deliveryFailureRate =
      finishedDeliveries > 0
        ? Math.round((totalFailed / finishedDeliveries) * 1000) / 10
        : 0;

    const channelBreakdown = Array.from(channelMap.entries()).map(
      ([channel, stats]) => ({
        channel,
        ...stats,
      }),
    );

    const typeBreakdown = typeGrouped.map((g) => ({
      type: g.type,
      count: g._count._all,
    }));

    return {
      totalNotifications,
      totalSent,
      totalPending,
      totalFailed,
      totalSkipped,
      totalRead,
      totalUnread,
      deliverySuccessRate,
      deliveryFailureRate,
      channelBreakdown,
      typeBreakdown,
    };
  }

  async findDeliveries(query: AdminDeliveryQueryDto) {
    const {
      channel,
      status,
      type,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    const where: Prisma.NotificationDeliveryWhereInput = {
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    if (type || search) {
      where.notification = {
        ...(type ? { type } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { message: { contains: search, mode: 'insensitive' } },
                {
                  user: {
                    OR: [
                      { fullName: { contains: search, mode: 'insensitive' } },
                      { email: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      };
    }

    const skip = (page - 1) * limit;

    const [deliveries, total] = await prisma.$transaction([
      prisma.notificationDelivery.findMany({
        where,
        select: {
          id: true,
          notificationId: true,
          channel: true,
          status: true,
          attemptCount: true,
          nextAttemptAt: true,
          sentAt: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          notification: {
            select: {
              id: true,
              type: true,
              priority: true,
              title: true,
              message: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.notificationDelivery.count({ where }),
    ]);

    const formattedData: AdminDeliveryItemDto[] = deliveries.map((d) => ({
      id: d.id,
      notificationId: d.notificationId,
      channel: d.channel,
      status: d.status,
      attemptCount: d.attemptCount,
      nextAttemptAt: d.nextAttemptAt,
      sentAt: d.sentAt,
      failureReason: d.failureReason,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      notification: {
        id: d.notification.id,
        type: d.notification.type,
        priority: d.notification.priority,
        title: d.notification.title,
        message: d.notification.message,
        createdAt: d.notification.createdAt,
      },
      user: {
        id: d.notification.user.id,
        email: d.notification.user.email,
        fullName: d.notification.user.fullName,
      },
    }));

    return {
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findDeliveryById(id: string) {
    return prisma.notificationDelivery.findUnique({
      where: { id },
      include: {
        notification: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
      },
    });
  }

  async retryDelivery(id: string) {
    return prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.PENDING,
        nextAttemptAt: new Date(),
        failureReason: null,
      },
      include: {
        notification: true,
      },
    });
  }

  async findTemplates(query?: AdminTemplateQueryDto) {
    const where: Prisma.NotificationTemplateWhereInput = {
      ...(query?.type ? { type: query.type } : {}),
      ...(query?.channel ? { channel: query.channel } : {}),
      ...(query?.language ? { language: query.language } : {}),
      ...(query?.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    return prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ type: 'asc' }, { language: 'asc' }],
    });
  }

  async findTemplateById(id: string) {
    return prisma.notificationTemplate.findUnique({
      where: { id },
    });
  }

  async updateTemplate(id: string, data: UpdateTemplateDto) {
    return prisma.notificationTemplate.update({
      where: { id },
      data,
    });
  }
}

export const adminNotificationRepository = new AdminNotificationRepository();
