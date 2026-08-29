import {
  NotificationChannel,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  ReminderType,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  PersistReminderDto,
  ReminderQueryDto,
} from './reminder.dto';

const reminderSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  remindAt: true,
  frequency: true,
  repeatInterval: true,
  endAt: true,
  nextTriggerAt: true,
  lastTriggeredAt: true,
  actionUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReminderSelect;

export type ReminderRecord = Prisma.ReminderGetPayload<{
  select: typeof reminderSelect;
}>;

export class ReminderRepository {
  async findAll(userId: string, query: ReminderQueryDto) {
    const { type, isActive, dueFrom, dueTo, page, limit } = query;
    const where: Prisma.ReminderWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(dueFrom || dueTo
        ? {
            nextTriggerAt: {
              ...(dueFrom ? { gte: dueFrom } : {}),
              ...(dueTo ? { lte: dueTo } : {}),
            },
          }
        : {}),
    };
    const skip = (page - 1) * limit;
    const [reminders, total] = await prisma.$transaction([
      prisma.reminder.findMany({
        where,
        select: reminderSelect,
        orderBy: [{ nextTriggerAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.reminder.count({ where }),
    ]);

    return {
      data: reminders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findById(userId: string, id: string) {
    return prisma.reminder.findFirst({
      where: { id, userId },
      select: reminderSelect,
    });
  }

  create(userId: string, data: PersistReminderDto) {
    return prisma.reminder.create({
      data: { userId, ...data },
      select: reminderSelect,
    });
  }

  update(id: string, data: PersistReminderDto) {
    return prisma.reminder.update({
      where: { id },
      data,
      select: reminderSelect,
    });
  }

  remove(id: string) {
    return prisma.reminder.delete({ where: { id }, select: { id: true } });
  }

  findDue(now: Date, limit: number = 100) {
    return prisma.reminder.findMany({
      where: {
        isActive: true,
        nextTriggerAt: { lte: now },
      },
      select: reminderSelect,
      orderBy: [{ nextTriggerAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async triggerDue(
    reminder: ReminderRecord,
    triggeredAt: Date,
    nextTriggerAt: Date | null,
    channels: NotificationChannel[] | null,
  ) {
    if (!reminder.nextTriggerAt) {
      return false;
    }
    const expectedTriggerAt = reminder.nextTriggerAt;
    const externalChannels = channels?.filter(
      (channel) => channel !== NotificationChannel.IN_APP,
    ) ?? [];
    const notificationType = reminder.type === ReminderType.RECURRING_PAYMENT
      ? NotificationType.RECURRING_PAYMENT_DUE
      : NotificationType.USER_REMINDER;

    try {
      return await prisma.$transaction(async (transaction) => {
        const current = await transaction.reminder.findFirst({
          where: {
            id: reminder.id,
            isActive: true,
            nextTriggerAt: expectedTriggerAt,
          },
          select: { id: true },
        });
        if (!current) {
          return false;
        }

        if (channels && channels.length > 0) {
          await transaction.notification.create({
            data: {
              userId: reminder.userId,
              type: notificationType,
              priority: reminder.type === ReminderType.RECURRING_PAYMENT
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL,
              title: reminder.title,
              message: reminder.message ?? 'A scheduled reminder is due.',
              channels,
              actionUrl: reminder.actionUrl,
              sourceType: NotificationSourceType.REMINDER,
              sourceId: reminder.id,
              dedupKey: `reminder:${reminder.id}:${expectedTriggerAt.toISOString()}`,
              data: {
                reminderId: reminder.id,
                scheduledAt: expectedTriggerAt.toISOString(),
              },
              deliveries: externalChannels.length > 0
                ? {
                    create: externalChannels.map((channel) => ({ channel })),
                  }
                : undefined,
            },
          });
        }

        await transaction.reminder.update({
          where: { id: reminder.id },
          data: {
            lastTriggeredAt: triggeredAt,
            nextTriggerAt,
            isActive: nextTriggerAt !== null,
          },
        });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')
      ) {
        return false;
      }
      throw error;
    }
  }
}
