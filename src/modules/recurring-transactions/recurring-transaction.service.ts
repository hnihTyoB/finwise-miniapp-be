import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  RecurringTransactionFrequency,
  RecurringTransactionMissedRunPolicy,
  ReminderFrequency,
  ReminderType,
} from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  businessWallTimeToInstant,
  BusinessDate,
  instantToBusinessDate,
  instantToBusinessWallTime,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import { cacheService } from '../../common/services/cache.service';
import { NotificationService } from '../notifications/notification.service';
import { TransactionRepository } from '../transactions/transaction.repository';
import {
  ConvertSubscriptionToRecurringTransactionDto,
  CreateRecurringTransactionDto,
  RecurringTransactionHistoryQueryDto,
  RecurringTransactionPreviewQueryDto,
  RecurringTransactionQueryDto,
  UpdateRecurringTransactionDto,
} from './recurring-transaction.dto';
import { RecurringTransactionEngine } from './recurring-transaction.engine';
import {
  RecurringTransactionDbClient,
  RecurringTransactionRepository,
  RecurringTransactionScheduleRecord,
} from './recurring-transaction.repository';

const DUE_BATCH_LIMIT = 100;

export class RecurringTransactionService {
  private readonly repository = new RecurringTransactionRepository();
  private readonly transactionRepository = new TransactionRepository();
  private readonly notificationService = new NotificationService();

  findAll(userId: string, query: RecurringTransactionQueryDto) {
    return this.repository.findAll(userId, query);
  }

  async findById(userId: string, id: string) {
    const schedule = await this.repository.findById(userId, id);
    if (!schedule) {
      throw new AppError('Recurring transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }
    return schedule;
  }

  async create(userId: string, data: CreateRecurringTransactionDto) {
    const today = instantToBusinessDate(new Date());
    const nextRunAt = this.resolveFirstRun(
      data.anchorDate,
      data.frequency,
      data.repeatInterval,
      data.endDate ?? null,
      data.missedRunPolicy,
      today,
    );
    if (data.isActive && !nextRunAt) {
      throw new AppError(
        'The schedule has no occurrence on or before endDate',
        422,
        ERROR_CODE.RECURRING_TRANSACTION_SCHEDULE_INVALID,
      );
    }

    return this.repository.runSerializable(async (transaction) => {
      await this.ensureValidRelations(
        userId,
        data.walletId,
        data.categoryId,
        data.type,
        transaction,
      );
      const created = await this.repository.create({
        userId,
        walletId: data.walletId,
        categoryId: data.categoryId,
        amount: data.amount,
        type: data.type,
        description: data.description ?? null,
        location: data.location ?? null,
        frequency: data.frequency,
        repeatInterval: data.repeatInterval,
        anchorDate: businessDateToPrismaDate(data.anchorDate),
        endDate: data.endDate ? businessDateToPrismaDate(data.endDate) : null,
        nextRunAt: nextRunAt ? businessDateToPrismaDate(nextRunAt) : null,
        missedRunPolicy: data.missedRunPolicy,
        isActive: data.isActive && nextRunAt !== null,
      }, transaction);

      if (data.remindDaysBefore !== undefined) {
        await this.syncReminder(userId, created.id, created, data.remindDaysBefore, transaction);
      }

      return created;
    });
  }

  async update(userId: string, id: string, data: UpdateRecurringTransactionDto) {
    return this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, id, transaction);
      const walletId = data.walletId ?? current.walletId;
      const categoryId = data.categoryId ?? current.categoryId;
      const type = data.type ?? current.type;
      await this.ensureValidRelations(userId, walletId, categoryId, type, transaction);

      const anchorDate = data.anchorDate ?? prismaDateToBusinessDate(current.anchorDate);
      const endDate = data.endDate !== undefined
        ? data.endDate
        : current.endDate ? prismaDateToBusinessDate(current.endDate) : null;
      if (endDate && endDate < anchorDate) {
        throw new AppError(
          'endDate must be greater than or equal to anchorDate',
          422,
          ERROR_CODE.RECURRING_TRANSACTION_SCHEDULE_INVALID,
        );
      }

      const frequency = data.frequency ?? current.frequency;
      const repeatInterval = data.repeatInterval ?? current.repeatInterval;
      const missedRunPolicy = data.missedRunPolicy ?? current.missedRunPolicy;
      const timingChanged = data.anchorDate !== undefined
        || data.endDate !== undefined
        || data.frequency !== undefined
        || data.repeatInterval !== undefined
        || data.missedRunPolicy !== undefined;
      const nextRunAt = timingChanged
        ? this.resolveFirstRun(
            anchorDate,
            frequency,
            repeatInterval,
            endDate,
            missedRunPolicy,
            instantToBusinessDate(new Date()),
          )
        : current.nextRunAt ? prismaDateToBusinessDate(current.nextRunAt) : null;
      if (current.isActive && timingChanged && !nextRunAt) {
        throw new AppError(
          'The updated schedule has no occurrence on or before endDate',
          422,
          ERROR_CODE.RECURRING_TRANSACTION_SCHEDULE_INVALID,
        );
      }

      const updated = await this.repository.update(id, {
        walletId,
        categoryId,
        amount: data.amount ?? current.amount,
        type,
        description: data.description !== undefined ? data.description : current.description,
        location: data.location !== undefined ? data.location : current.location,
        frequency,
        repeatInterval,
        anchorDate: businessDateToPrismaDate(anchorDate),
        endDate: endDate ? businessDateToPrismaDate(endDate) : null,
        nextRunAt: nextRunAt ? businessDateToPrismaDate(nextRunAt) : null,
        missedRunPolicy,
        isActive: current.isActive && nextRunAt !== null,
      }, transaction);

      if (data.remindDaysBefore !== undefined) {
        await this.syncReminder(userId, id, updated, data.remindDaysBefore, transaction);
      }

      return updated;
    });
  }

  async pause(userId: string, id: string) {
    return this.repository.runSerializable(async (transaction) => {
      await this.findRecord(userId, id, transaction);
      await transaction.reminder.updateMany({
        where: {
          userId,
          actionUrl: { startsWith: `/recurring-transactions?id=${id}` },
        },
        data: { isActive: false },
      });
      return this.repository.update(id, { isActive: false }, transaction);
    });
  }

  async resume(userId: string, id: string) {
    return this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, id, transaction);
      await this.ensureValidRelations(
        userId,
        current.walletId,
        current.categoryId,
        current.type,
        transaction,
      );
      const today = instantToBusinessDate(new Date());
      const anchorDate = prismaDateToBusinessDate(current.anchorDate);
      const endDate = current.endDate ? prismaDateToBusinessDate(current.endDate) : null;
      const preservedNext = current.nextRunAt
        ? prismaDateToBusinessDate(current.nextRunAt)
        : null;
      let nextRunAt = preservedNext;
      if (
        !nextRunAt
        || (
          current.missedRunPolicy === RecurringTransactionMissedRunPolicy.SKIP
          && nextRunAt < today
        )
      ) {
        nextRunAt = this.resolveFirstRun(
          anchorDate,
          current.frequency,
          current.repeatInterval,
          endDate,
          current.missedRunPolicy,
          today,
        );
      }
      if (!nextRunAt || (endDate && nextRunAt > endDate)) {
        throw new AppError(
          'The schedule has no future occurrence on or before endDate',
          422,
          ERROR_CODE.RECURRING_TRANSACTION_SCHEDULE_INVALID,
        );
      }
      await transaction.reminder.updateMany({
        where: {
          userId,
          actionUrl: { startsWith: `/recurring-transactions?id=${id}` },
        },
        data: { isActive: true },
      });
      return this.repository.update(id, {
        isActive: true,
        nextRunAt: businessDateToPrismaDate(nextRunAt),
      }, transaction);
    });
  }

  async remove(userId: string, id: string) {
    await this.repository.runSerializable(async (transaction) => {
      await this.findRecord(userId, id, transaction);
      await transaction.reminder.deleteMany({
        where: {
          userId,
          actionUrl: { startsWith: `/recurring-transactions?id=${id}` },
        },
      });
      await this.repository.archive(id, transaction);
    });
    return { id };
  }

  async preview(
    userId: string,
    id: string,
    query: RecurringTransactionPreviewQueryDto,
  ) {
    const schedule = await this.repository.runSerializable((transaction) =>
      this.findRecord(userId, id, transaction));
    const from = query.from
      ?? (schedule.nextRunAt
        ? prismaDateToBusinessDate(schedule.nextRunAt)
        : instantToBusinessDate(new Date()));
    return {
      dates: RecurringTransactionEngine.preview(
        prismaDateToBusinessDate(schedule.anchorDate),
        schedule.frequency,
        schedule.repeatInterval,
        from,
        query.count,
        schedule.endDate ? prismaDateToBusinessDate(schedule.endDate) : null,
      ),
    };
  }

  async history(
    userId: string,
    id: string,
    query: RecurringTransactionHistoryQueryDto,
  ) {
    const result = await this.repository.findHistory(userId, id, query);
    if (!result) {
      throw new AppError('Recurring transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }
    return result;
  }

  async convertSubscription(
    userId: string,
    data: ConvertSubscriptionToRecurringTransactionDto,
  ) {
    const existing = await this.repository.findExistingSubscriptionSchedule(
      userId,
      data.categoryId,
      data.merchantName,
      data.amount,
      data.frequency,
    );
    if (existing) return existing;
    return this.create(userId, {
      walletId: data.walletId,
      categoryId: data.categoryId,
      amount: data.amount,
      type: 'EXPENSE',
      description: data.merchantName,
      frequency: data.frequency,
      repeatInterval: 1,
      anchorDate: data.nextExpectedAt,
      missedRunPolicy: 'SKIP',
      isActive: true,
    });
  }

  async processDue(now: Date, limit: number = DUE_BATCH_LIMIT) {
    const today = instantToBusinessDate(now);
    const due = await this.repository.findDue(today, limit);
    let processed = 0;
    let failed = 0;
    for (const candidate of due) {
      try {
        const outcome = await this.processSchedule(candidate.id, today, now);
        if (outcome === 'POSTED') processed += 1;
        if (outcome === 'FAILED') failed += 1;
      } catch (error) {
        failed += 1;
        console.error('Failed to process recurring transaction schedule', error);
      }
    }
    return { processed, failed };
  }

  private async processSchedule(id: string, today: BusinessDate, now: Date) {
    let scheduledFor: BusinessDate | null = null;
    try {
      const result = await this.repository.runSerializable(async (transaction) => {
        const schedule = await this.repository.findDueRecord(id, today, transaction);
        if (!schedule || !schedule.nextRunAt) return null;

        const anchorDate = prismaDateToBusinessDate(schedule.anchorDate);
        const endDate = schedule.endDate ? prismaDateToBusinessDate(schedule.endDate) : null;
        scheduledFor = prismaDateToBusinessDate(schedule.nextRunAt);
        if (
          schedule.missedRunPolicy === RecurringTransactionMissedRunPolicy.SKIP
          && scheduledFor < today
        ) {
          scheduledFor = RecurringTransactionEngine.firstOnOrAfter(
            anchorDate,
            schedule.frequency,
            schedule.repeatInterval,
            today,
          );
        }

        if ((endDate && scheduledFor > endDate) || scheduledFor > today) {
          const next = endDate && scheduledFor > endDate ? null : scheduledFor;
          await this.repository.rescheduleWithoutExecution(schedule.id, next, transaction);
          return null;
        }

        const existing = await this.repository.findOccurrence(
          schedule.id,
          scheduledFor,
          transaction,
        );
        const nextCandidate = RecurringTransactionEngine.nextAfter(
          anchorDate,
          schedule.frequency,
          schedule.repeatInterval,
          scheduledFor,
        );
        const nextRunAt = endDate && nextCandidate > endDate ? null : nextCandidate;
        if (existing?.status === 'POSTED') {
          await this.repository.updateAfterExecution(schedule.id, nextRunAt, now, transaction);
          return null;
        }

        await this.ensureValidRelations(
          schedule.userId,
          schedule.walletId,
          schedule.categoryId,
          schedule.type,
          transaction,
        );
        const created = await this.transactionRepository.create(schedule.userId, {
          walletId: schedule.walletId,
          categoryId: schedule.categoryId,
          amount: schedule.amount.toFixed(2),
          type: schedule.type,
          description: schedule.description,
          location: schedule.location,
          date: scheduledFor,
        }, transaction);
        await this.transactionRepository.adjustWalletBalance(
          schedule.walletId,
          schedule.amount,
          schedule.type,
          'APPLY',
          transaction,
        );
        await this.repository.upsertPostedOccurrence(
          schedule.id,
          scheduledFor,
          created.id,
          transaction,
        );
        await this.repository.updateAfterExecution(schedule.id, nextRunAt, now, transaction);
        return { transaction: created, userId: schedule.userId };
      });

      if (!result) return 'SKIPPED' as const;
      try {
        await Promise.all([
          cacheService.clearPattern(`finwise:cache:reports:${result.userId}:*`),
          cacheService.clearPattern(`finwise:cache:forecast:${result.userId}:*`),
        ]);
        await this.notificationService.detectUnusualTransaction(result.userId, result.transaction);
      } catch (error) {
        console.error('Recurring transaction posted but post-commit hooks failed', error);
      }
      return 'POSTED' as const;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        return 'SKIPPED' as const;
      }
      if (error instanceof AppError && scheduledFor) {
        const failedSchedule = await this.repository.recordFailure(
          id,
          scheduledFor,
          error.code ?? ERROR_CODE.RECURRING_TRANSACTION_EXECUTION_FAILED,
          error.message.slice(0, 500),
        );
        if (failedSchedule) {
          await this.notificationService.create({
            userId: failedSchedule.userId,
            type: NotificationType.SYSTEM,
            priority: NotificationPriority.HIGH,
            title: 'Recurring transaction paused',
            message: `A recurring transaction could not be posted: ${error.message}`,
            sourceType: NotificationSourceType.SYSTEM,
            sourceId: id,
            actionUrl: '/recurring-transactions',
            data: { scheduleId: id, scheduledFor, failureCode: error.code ?? null },
            dedupKey: `recurring-transaction:${id}:${scheduledFor}:failed`,
          });
        }
        return 'FAILED' as const;
      }
      throw error;
    }
  }

  private resolveFirstRun(
    anchorDate: BusinessDate,
    frequency: RecurringTransactionScheduleRecord['frequency'],
    repeatInterval: number,
    endDate: BusinessDate | null,
    missedRunPolicy: RecurringTransactionMissedRunPolicy,
    today: BusinessDate,
  ) {
    const candidate = missedRunPolicy === RecurringTransactionMissedRunPolicy.CATCH_UP
      ? anchorDate
      : RecurringTransactionEngine.firstOnOrAfter(
          anchorDate,
          frequency,
          repeatInterval,
          today,
        );
    return endDate && candidate > endDate ? null : candidate;
  }

  private async findRecord(
    userId: string,
    id: string,
    transaction: RecurringTransactionDbClient,
  ) {
    const schedule = await this.repository.findRecord(userId, id, transaction);
    if (!schedule) {
      throw new AppError('Recurring transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }
    return schedule;
  }

  private async ensureValidRelations(
    userId: string,
    walletId: string,
    categoryId: string,
    type: RecurringTransactionScheduleRecord['type'],
    transaction: RecurringTransactionDbClient,
  ) {
    const [wallet, category] = await Promise.all([
      this.transactionRepository.findWallet(userId, walletId, transaction),
      this.transactionRepository.findCategory(userId, categoryId, transaction),
    ]);
    if (!wallet) throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
    if (wallet.isArchived) {
      throw new AppError('Archived wallet cannot be used for transactions', 409, ERROR_CODE.WALLET_ARCHIVED);
    }
    if (!category) throw new AppError('Category not found', 404, ERROR_CODE.NOT_FOUND);
    if (category.isArchived) {
      throw new AppError('Archived category cannot be used for transactions', 409, ERROR_CODE.CATEGORY_ARCHIVED);
    }
    if (category.type !== type) {
      throw new AppError(
        'Transaction type must match category type',
        409,
        ERROR_CODE.TRANSACTION_CATEGORY_TYPE_MISMATCH,
      );
    }
  }

  private async syncReminder(
    userId: string,
    scheduleId: string,
    schedule: {
      description?: string | null;
      frequency: RecurringTransactionFrequency;
      repeatInterval: number;
      anchorDate: BusinessDate;
      endDate?: BusinessDate | null;
      nextRunAt?: BusinessDate | null;
      isActive: boolean;
    },
    remindDaysBefore: number | null | undefined,
    transaction: RecurringTransactionDbClient,
  ) {
    await transaction.reminder.deleteMany({
      where: {
        userId,
        actionUrl: { startsWith: `/recurring-transactions?id=${scheduleId}` },
      },
    });

    if (remindDaysBefore === null || remindDaysBefore === undefined) {
      return;
    }

    const nextRunBusinessDate = schedule.nextRunAt ?? schedule.anchorDate;
    const reminderBusinessDate = addBusinessDays(nextRunBusinessDate, -remindDaysBefore);

    const remindAt = businessWallTimeToInstant(reminderBusinessDate, '09:00:00');

    const now = new Date();
    let nextTriggerAt: Date | null = remindAt;
    if (remindAt <= now) {
      nextTriggerAt = now;
    }

    const endAt = schedule.endDate
      ? businessWallTimeToInstant(
          addBusinessDays(schedule.endDate, -remindDaysBefore),
          '23:59:59',
        )
      : null;

    const frequencyMap: Record<RecurringTransactionFrequency, ReminderFrequency> = {
      [RecurringTransactionFrequency.DAILY]: ReminderFrequency.DAILY,
      [RecurringTransactionFrequency.WEEKLY]: ReminderFrequency.WEEKLY,
      [RecurringTransactionFrequency.MONTHLY]: ReminderFrequency.MONTHLY,
      [RecurringTransactionFrequency.YEARLY]: ReminderFrequency.YEARLY,
    };

    const actionUrl = `/recurring-transactions?id=${scheduleId}&remindDaysBefore=${remindDaysBefore}`;
    const desc = schedule.description ? ` (${schedule.description})` : '';

    await transaction.reminder.create({
      data: {
        userId,
        type: ReminderType.RECURRING_PAYMENT,
        title: `Nhắc thanh toán giao dịch định kỳ${desc}`,
        message: `Giao dịch định kỳ${desc} sắp đến hạn thực hiện.`,
        remindAt,
        frequency: frequencyMap[schedule.frequency] ?? ReminderFrequency.MONTHLY,
        repeatInterval: schedule.repeatInterval,
        endAt,
        nextTriggerAt: schedule.isActive ? nextTriggerAt : null,
        actionUrl,
        isActive: schedule.isActive,
      },
    });
  }
}

