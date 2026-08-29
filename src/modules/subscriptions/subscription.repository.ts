import { ReminderType, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
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

  async convertToReminder(userId: string, input: ConvertSubscriptionToReminderDto) {
    const remindAtDate = new Date(input.remindAt);

    return prisma.reminder.create({
      data: {
        userId,
        title: input.merchantName,
        message: `Thanh toán gói cước định kỳ: ${input.merchantName} (${parseFloat(input.amount).toLocaleString()} VND)`,
        type: ReminderType.RECURRING_PAYMENT,
        frequency: input.frequency,
        repeatInterval: 1,
        remindAt: remindAtDate,
        nextTriggerAt: remindAtDate,
        isActive: true,
      },
    });
  }
}
