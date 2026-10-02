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
  addBusinessDays,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
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
          const scheduleMatch = reminder.actionUrl?.match(/[?&]id=([^&]+)/);
          const scheduleId = scheduleMatch ? scheduleMatch[1] : undefined;
          const dueDateMatch = reminder.actionUrl?.match(/[?&]dueDate=([^&]+)/);
          const remindDaysMatch = reminder.actionUrl?.match(/[?&]remindDaysBefore=(\d+)/);

          let dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
          if (scheduleId) {
            const schedule = await transaction.recurringTransactionSchedule.findUnique({
              where: { id: scheduleId },
              select: { nextRunAt: true, anchorDate: true },
            });
            if (schedule) {
              const runDate = schedule.nextRunAt ?? schedule.anchorDate;
              dueDate = prismaDateToBusinessDate(runDate);
            }
          } else if (!dueDate && remindDaysMatch) {
            const days = parseInt(remindDaysMatch[1], 10);
            const triggerDate = instantToBusinessDate(expectedTriggerAt);
            dueDate = addBusinessDays(triggerDate, days);
          }

          let title = reminder.title;
          let message = reminder.message ?? 'Đã đến thời gian nhắc nhở theo lịch.';
          if (reminder.actionUrl === '/transactions?daily=1') {
            const template = await transaction.notificationTemplate.findFirst({
              where: {
                type: NotificationType.USER_REMINDER,
                channel: NotificationChannel.IN_APP,
                isActive: true,
              },
            });
            if (template) {
              title = template.titleTemplate;
              message = template.bodyTemplate;
            }
          } else if (dueDate && reminder.type === ReminderType.RECURRING_PAYMENT) {
            if (!message.includes(dueDate)) {
              message = message.replace(/\.?$/, ` vào ngày ${dueDate}.`);
            }
          }

          await transaction.notification.create({
            data: {
              userId: reminder.userId,
              type: notificationType,
              priority: reminder.type === ReminderType.RECURRING_PAYMENT
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL,
              title,
              message,
              channels,
              actionUrl: reminder.actionUrl,
              sourceType: NotificationSourceType.REMINDER,
              sourceId: reminder.id,
              dedupKey: `reminder:${reminder.id}:${expectedTriggerAt.toISOString()}`,
              expiresAt: null,
              data: {
                reminderId: reminder.id,
                scheduledAt: expectedTriggerAt.toISOString(),
                ...(scheduleId ? { scheduleId } : {}),
                ...(dueDate ? { dueDate } : {}),
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
  /**
   * Find the system-managed daily-transaction reminder for a user.
   * Identified by the reserved actionUrl marker.
   */
  findDailyTransactionReminder(userId: string) {
    return prisma.reminder.findFirst({
      where: {
        userId,
        actionUrl: '/transactions?daily=1',
      },
      select: reminderSelect,
    });
  }

  /**
   * Find active notification template for daily reminders from notification_templates table.
   */
  findDailyReminderTemplate(language: string = 'vi') {
    return prisma.notificationTemplate.findFirst({
      where: {
        type: NotificationType.USER_REMINDER,
        channel: NotificationChannel.IN_APP,
        language,
        isActive: true,
      },
    });
  }

  /**
   * Create or update the daily-transaction reminder for a user.
   * remindAt determines the wall-clock time of day (the date part is ignored
   * by the worker; only the HH:mm is used to reschedule daily).
   */
  async upsertDailyTransactionReminder(
    userId: string,
    remindAt: Date,
    nextTriggerAt: Date | null,
    isActive: boolean,
    title: string,
    message: string,
  ) {
    const existing = await this.findDailyTransactionReminder(userId);
    if (existing) {
      return prisma.reminder.update({
        where: { id: existing.id },
        data: { remindAt, nextTriggerAt, isActive, title, message },
        select: reminderSelect,
      });
    }
    return prisma.reminder.create({
      data: {
        userId,
        type: ReminderType.GENERAL,
        title,
        message,
        remindAt,
        frequency: 'DAILY',
        repeatInterval: 1,
        endAt: null,
        nextTriggerAt,
        actionUrl: '/transactions?daily=1',
        isActive,
      },
      select: reminderSelect,
    });
  }

  /**
   * Check whether the user has at least one transaction recorded
   * on the given business date (YYYY-MM-DD in Asia/Ho_Chi_Minh).
   */
  async countTodayTransactions(userId: string, businessDate: string): Promise<number> {
    const dayStart = new Date(`${businessDate}T00:00:00+07:00`);
    const dayEnd   = new Date(`${businessDate}T23:59:59.999+07:00`);
    return prisma.transaction.count({
      where: {
        wallet: { userId },
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });
  }
}
