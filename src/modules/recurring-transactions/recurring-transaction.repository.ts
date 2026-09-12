import {
  Prisma,
  RecurringTransactionFrequency,
  RecurringTransactionOccurrenceStatus,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  businessDateToPrismaDate,
  BusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  RecurringTransactionHistoryQueryDto,
  RecurringTransactionQueryDto,
} from './recurring-transaction.dto';

const scheduleSelect = {
  id: true,
  userId: true,
  walletId: true,
  categoryId: true,
  amount: true,
  type: true,
  description: true,
  location: true,
  frequency: true,
  repeatInterval: true,
  anchorDate: true,
  endDate: true,
  nextRunAt: true,
  missedRunPolicy: true,
  lastRunAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  wallet: {
    select: { id: true, name: true, currency: true, isArchived: true },
  },
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, isArchived: true },
  },
} satisfies Prisma.RecurringTransactionScheduleSelect;

export type RecurringTransactionScheduleRecord = Prisma.RecurringTransactionScheduleGetPayload<{
  select: typeof scheduleSelect;
}>;

export type RecurringTransactionDbClient = Prisma.TransactionClient;

function toScheduleResponse(
  record: RecurringTransactionScheduleRecord,
  remindDaysBefore?: number | null,
) {
  const { userId: _userId, ...schedule } = record;
  return {
    ...schedule,
    amount: schedule.amount.toFixed(2),
    anchorDate: prismaDateToBusinessDate(schedule.anchorDate),
    endDate: schedule.endDate ? prismaDateToBusinessDate(schedule.endDate) : null,
    nextRunAt: schedule.nextRunAt ? prismaDateToBusinessDate(schedule.nextRunAt) : null,
    remindDaysBefore: remindDaysBefore ?? null,
  };
}

export class RecurringTransactionRepository {
  async runSerializable<T>(
    operation: (transaction: RecurringTransactionDbClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2034'
          && attempt < maxAttempts;
        if (!retryable) throw error;
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  async findAll(userId: string, query: RecurringTransactionQueryDto) {
    const where: Prisma.RecurringTransactionScheduleWhereInput = {
      userId,
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [records, total, reminders] = await prisma.$transaction([
      prisma.recurringTransactionSchedule.findMany({
        where,
        select: scheduleSelect,
        orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      prisma.recurringTransactionSchedule.count({ where }),
      prisma.reminder.findMany({
        where: {
          userId,
          actionUrl: { startsWith: '/recurring-transactions?id=' },
          isActive: true,
        },
        select: { actionUrl: true },
      }),
    ]);

    const reminderMap = new Map<string, number>();
    for (const r of reminders) {
      if (r.actionUrl) {
        const match = r.actionUrl.match(/id=([^&]+)(?:&remindDaysBefore=(\d+))?/);
        if (match) {
          const id = match[1];
          const days = match[2] !== undefined ? parseInt(match[2], 10) : 0;
          reminderMap.set(id, days);
        }
      }
    }

    return {
      data: records.map((record) => toScheduleResponse(record, reminderMap.get(record.id))),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(userId: string, id: string) {
    const [record, reminder] = await Promise.all([
      prisma.recurringTransactionSchedule.findFirst({
        where: { id, userId, deletedAt: null },
        select: scheduleSelect,
      }),
      prisma.reminder.findFirst({
        where: {
          userId,
          actionUrl: { startsWith: `/recurring-transactions?id=${id}` },
          isActive: true,
        },
        select: { actionUrl: true },
      }),
    ]);

    let remindDaysBefore: number | null = null;
    if (reminder?.actionUrl) {
      const match = reminder.actionUrl.match(/&remindDaysBefore=(\d+)/);
      remindDaysBefore = match ? parseInt(match[1], 10) : 0;
    }

    return record ? toScheduleResponse(record, remindDaysBefore) : null;
  }

  async findExistingSubscriptionSchedule(
    userId: string,
    categoryId: string,
    description: string,
    amount: string,
    frequency: RecurringTransactionFrequency,
  ) {
    const record = await prisma.recurringTransactionSchedule.findFirst({
      where: {
        userId,
        categoryId,
        amount,
        type: 'EXPENSE',
        frequency,
        description: { equals: description, mode: Prisma.QueryMode.insensitive },
        deletedAt: null,
      },
      select: scheduleSelect,
    });
    return record ? toScheduleResponse(record) : null;
  }

  findRecord(
    userId: string,
    id: string,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionSchedule.findFirst({
      where: { id, userId, deletedAt: null },
      select: scheduleSelect,
    });
  }

  async create(
    data: Prisma.RecurringTransactionScheduleUncheckedCreateInput,
    transaction: RecurringTransactionDbClient,
  ) {
    const record = await transaction.recurringTransactionSchedule.create({
      data,
      select: scheduleSelect,
    });
    return toScheduleResponse(record);
  }

  async update(
    id: string,
    data: Prisma.RecurringTransactionScheduleUncheckedUpdateInput,
    transaction: RecurringTransactionDbClient,
  ) {
    const record = await transaction.recurringTransactionSchedule.update({
      where: { id },
      data,
      select: scheduleSelect,
    });
    return toScheduleResponse(record);
  }

  archive(id: string, transaction: RecurringTransactionDbClient) {
    return transaction.recurringTransactionSchedule.update({
      where: { id },
      data: { isActive: false, nextRunAt: null, deletedAt: new Date() },
      select: { id: true },
    });
  }

  async findHistory(
    userId: string,
    scheduleId: string,
    query: RecurringTransactionHistoryQueryDto,
  ) {
    const schedule = await prisma.recurringTransactionSchedule.findFirst({
      where: { id: scheduleId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!schedule) return null;

    const where: Prisma.RecurringTransactionOccurrenceWhereInput = { scheduleId };
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await prisma.$transaction([
      prisma.recurringTransactionOccurrence.findMany({
        where,
        select: {
          id: true,
          scheduledFor: true,
          status: true,
          transactionId: true,
          failureCode: true,
          failureMessage: true,
          attemptCount: true,
          createdAt: true,
          updatedAt: true,
          transaction: {
            select: { id: true, amount: true, type: true, date: true },
          },
        },
        orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      prisma.recurringTransactionOccurrence.count({ where }),
    ]);

    return {
      data: records.map((record) => ({
        ...record,
        scheduledFor: prismaDateToBusinessDate(record.scheduledFor),
        transaction: record.transaction
          ? {
              ...record.transaction,
              amount: record.transaction.amount.toFixed(2),
              date: prismaDateToBusinessDate(record.transaction.date),
            }
          : null,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  findDue(today: BusinessDate, limit: number = 100) {
    return prisma.recurringTransactionSchedule.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        nextRunAt: { lte: businessDateToPrismaDate(today) },
      },
      select: { id: true },
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  findDueRecord(
    id: string,
    today: BusinessDate,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionSchedule.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        nextRunAt: { lte: businessDateToPrismaDate(today) },
      },
      select: scheduleSelect,
    });
  }

  findOccurrence(
    scheduleId: string,
    scheduledFor: BusinessDate,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionOccurrence.findUnique({
      where: {
        scheduleId_scheduledFor: {
          scheduleId,
          scheduledFor: businessDateToPrismaDate(scheduledFor),
        },
      },
      select: { id: true, status: true },
    });
  }

  upsertPostedOccurrence(
    scheduleId: string,
    scheduledFor: BusinessDate,
    transactionId: string,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionOccurrence.upsert({
      where: {
        scheduleId_scheduledFor: {
          scheduleId,
          scheduledFor: businessDateToPrismaDate(scheduledFor),
        },
      },
      create: {
        scheduleId,
        scheduledFor: businessDateToPrismaDate(scheduledFor),
        status: RecurringTransactionOccurrenceStatus.POSTED,
        transactionId,
      },
      update: {
        status: RecurringTransactionOccurrenceStatus.POSTED,
        transactionId,
        failureCode: null,
        failureMessage: null,
        attemptCount: { increment: 1 },
      },
    });
  }

  updateAfterExecution(
    id: string,
    nextRunAt: BusinessDate | null,
    executedAt: Date,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionSchedule.update({
      where: { id },
      data: {
        nextRunAt: nextRunAt ? businessDateToPrismaDate(nextRunAt) : null,
        lastRunAt: executedAt,
        isActive: nextRunAt !== null,
      },
    });
  }

  rescheduleWithoutExecution(
    id: string,
    nextRunAt: BusinessDate | null,
    transaction: RecurringTransactionDbClient,
  ) {
    return transaction.recurringTransactionSchedule.update({
      where: { id },
      data: {
        nextRunAt: nextRunAt ? businessDateToPrismaDate(nextRunAt) : null,
        isActive: nextRunAt !== null,
      },
    });
  }

  async recordFailure(
    scheduleId: string,
    scheduledFor: BusinessDate,
    failureCode: string,
    failureMessage: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      const schedule = await transaction.recurringTransactionSchedule.findUnique({
        where: { id: scheduleId },
        select: { id: true, userId: true, description: true, deletedAt: true },
      });
      if (!schedule || schedule.deletedAt) return null;

      await transaction.recurringTransactionOccurrence.upsert({
        where: {
          scheduleId_scheduledFor: {
            scheduleId,
            scheduledFor: businessDateToPrismaDate(scheduledFor),
          },
        },
        create: {
          scheduleId,
          scheduledFor: businessDateToPrismaDate(scheduledFor),
          status: RecurringTransactionOccurrenceStatus.FAILED,
          failureCode,
          failureMessage,
        },
        update: {
          status: RecurringTransactionOccurrenceStatus.FAILED,
          transactionId: null,
          failureCode,
          failureMessage,
          attemptCount: { increment: 1 },
        },
      });
      await transaction.recurringTransactionSchedule.update({
        where: { id: scheduleId },
        data: { isActive: false },
      });
      return schedule;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
