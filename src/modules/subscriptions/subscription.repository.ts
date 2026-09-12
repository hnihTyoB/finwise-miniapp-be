import { ReminderType, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  addBusinessDays,
  businessWallTimeToInstant,
  instantToBusinessWallTime,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import { ConvertSubscriptionToReminderDto } from './subscription.dto';
import { RawSubscriptionTxn } from './subscription-engine';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class SubscriptionRepository {
  async getHistoricalExpenseTransactions(
    userId: string,
    days = 180,
  ): Promise<RawSubscriptionTxn[]> {
    const since = new Date(Date.now() - days * MILLISECONDS_PER_DAY);

    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        date: { gte: since },
      },
      include: {
        category: { select: { id: true, name: true } },
        wallet: { select: { currency: true } },
      },
      orderBy: {
        date: 'asc',
      },
    });

    return txns.map((t) => ({
      id: t.id,
      description: t.description || t.category.name,
      amount: t.amount.toNumber(),
      currency: t.wallet.currency,
      categoryId: t.categoryId,
      categoryName: t.category.name,
      date: prismaDateToBusinessDate(t.date),
    }));
  }

  async getExistingReminderTitles(userId: string): Promise<Set<string>> {
    const reminders = await prisma.reminder.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        title: true,
      },
    });

    return new Set(reminders.map((r) => r.title.toLowerCase()));
  }

  async getExistingRecurringScheduleDescriptions(userId: string): Promise<Set<string>> {
    const schedules = await prisma.recurringTransactionSchedule.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        description: true,
      },
    });

    return new Set(
      schedules
        .map((s) => s.description?.toLowerCase().trim())
        .filter((desc): desc is string => Boolean(desc)),
    );
  }

  async convertToReminder(userId: string, input: ConvertSubscriptionToReminderDto) {
    const defaultDays = input.frequency === 'MONTHLY' ? 2 : input.frequency === 'YEARLY' ? 7 : 0;
    const remindDaysBefore = Math.max(0, input.remindDaysBefore ?? defaultDays);
    const renewalWall = instantToBusinessWallTime(new Date(input.remindAt));
    const triggerDateStr = addBusinessDays(renewalWall.date, -remindDaysBefore);
    const remindAtDate = businessWallTimeToInstant(triggerDateStr, renewalWall.time);

    return prisma.reminder.create({
      data: {
        userId,
        title: input.merchantName,
        message: `Thanh toán gói cước định kỳ: ${input.merchantName} (${parseFloat(input.amount).toLocaleString('vi-VN')} ${input.currency ?? 'VND'})`,
        type: ReminderType.RECURRING_PAYMENT,
        frequency: input.frequency,
        repeatInterval: 1,
        remindAt: remindAtDate,
        nextTriggerAt: remindAtDate,
        isActive: true,
      },
    });
  }

  /**
   * Return a batch of user IDs who have had at least one EXPENSE transaction
   * in the last `days` days. Uses cursor-based pagination so the caller can
   * iterate without loading all users into memory at once.
   */
  async findActiveUserIdsBatch(
    days: number,
    cursor: string | undefined,
    batchSize: number,
  ): Promise<{ userIds: string[]; nextCursor: string | undefined }> {
    const since = new Date(Date.now() - days * MILLISECONDS_PER_DAY);

    const rows = await prisma.transaction.groupBy({
      by: ['userId'],
      where: {
        type: TransactionType.EXPENSE,
        date: { gte: since },
        ...(cursor ? { userId: { gt: cursor } } : {}),
      },
      orderBy: { userId: 'asc' },
      take: batchSize,
    });

    const userIds = rows.map((r) => r.userId);
    const nextCursor = userIds.length === batchSize ? userIds[userIds.length - 1] : undefined;
    return { userIds, nextCursor };
  }
}
