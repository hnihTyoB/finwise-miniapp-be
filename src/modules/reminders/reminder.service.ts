import { NotificationType, ReminderFrequency } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import {
  addBusinessDays,
  addBusinessMonthsClamped,
  businessDateToPrismaDate,
  businessWallTimeToInstant,
  instantToBusinessWallTime,
} from '../../common/date-time/business-time';
import { ERROR_CODE } from '../../common/errors/error-code';
import { NotificationService } from '../notifications/notification.service';
import {
  CreateReminderDto,
  PersistReminderDto,
  ReminderQueryDto,
  UpdateReminderDto,
} from './reminder.dto';
import { ReminderRecord, ReminderRepository } from './reminder.repository';

export class ReminderService {
  private readonly repository = new ReminderRepository();
  private readonly notificationService = new NotificationService();

  async findAll(userId: string, query: ReminderQueryDto) {
    const result = await this.repository.findAll(userId, query);
    return { data: result.data.map(this.toResponse), meta: result.meta };
  }

  async findById(userId: string, id: string) {
    return this.toResponse(await this.findRecord(userId, id));
  }

  create(userId: string, data: CreateReminderDto) {
    const persistence = this.resolveCreate(data);
    return this.repository.create(userId, persistence).then(this.toResponse);
  }

  async update(userId: string, id: string, data: UpdateReminderDto) {
    const current = await this.findRecord(userId, id);
    const persistence = this.resolveUpdate(current, data);
    return this.toResponse(await this.repository.update(id, persistence));
  }

  async remove(userId: string, id: string) {
    await this.findRecord(userId, id);
    return this.repository.remove(id);
  }

  async processDue(now: Date) {
    const due = await this.repository.findDue(now);
    for (const reminder of due) {
      const nextTriggerAt = this.calculateNextTrigger(
        reminder.remindAt,
        reminder.frequency,
        reminder.repeatInterval,
        reminder.endAt,
        now,
      );
      const channels = await this.notificationService.getChannelsForType(
        reminder.type === 'RECURRING_PAYMENT'
          ? NotificationType.RECURRING_PAYMENT_DUE
          : NotificationType.USER_REMINDER,
        reminder.userId,
      );
      await this.repository.triggerDue(reminder, now, nextTriggerAt, channels);
    }
    return due.length;
  }

  private resolveCreate(data: CreateReminderDto): PersistReminderDto {
    const now = new Date();
    const repeatInterval = data.frequency === ReminderFrequency.ONCE
      ? 1
      : data.repeatInterval;
    const nextTriggerAt = data.isActive
      ? this.firstTrigger(data.remindAt, data.frequency, repeatInterval, data.endAt ?? null, now)
      : null;

    return {
      type: data.type,
      title: data.title,
      message: data.message ?? null,
      remindAt: data.remindAt,
      frequency: data.frequency,
      repeatInterval,
      endAt: data.frequency === ReminderFrequency.ONCE ? null : data.endAt ?? null,
      nextTriggerAt,
      actionUrl: data.actionUrl ?? null,
      isActive: data.isActive,
    };
  }

  private resolveUpdate(
    current: ReminderRecord,
    data: UpdateReminderDto,
  ): PersistReminderDto {
    const frequency = data.frequency ?? current.frequency;
    const remindAt = data.remindAt ?? current.remindAt;
    const repeatInterval = frequency === ReminderFrequency.ONCE
      ? 1
      : data.repeatInterval ?? current.repeatInterval;
    if (frequency === ReminderFrequency.ONCE && data.endAt) {
      throw new AppError(
        'endAt is only supported for recurring reminders',
        422,
        ERROR_CODE.REMINDER_SCHEDULE_INVALID,
      );
    }
    const endAt = frequency === ReminderFrequency.ONCE
      ? null
      : data.endAt !== undefined ? data.endAt : current.endAt;
    const isActive = data.isActive ?? current.isActive;

    if (endAt && endAt <= remindAt) {
      throw new AppError(
        'endAt must be after remindAt',
        422,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    const scheduleChanged = data.remindAt !== undefined
      || data.frequency !== undefined
      || data.repeatInterval !== undefined
      || data.endAt !== undefined
      || (data.isActive === true && !current.isActive);
    const nextTriggerAt = !isActive
      ? null
      : scheduleChanged
        ? this.firstTrigger(remindAt, frequency, repeatInterval, endAt, new Date())
        : current.nextTriggerAt;

    return {
      type: data.type ?? current.type,
      title: data.title ?? current.title,
      message: data.message !== undefined ? data.message : current.message,
      remindAt,
      frequency,
      repeatInterval,
      endAt,
      nextTriggerAt,
      actionUrl: data.actionUrl !== undefined ? data.actionUrl : current.actionUrl,
      isActive,
    };
  }

  private firstTrigger(
    remindAt: Date,
    frequency: ReminderFrequency,
    repeatInterval: number,
    endAt: Date | null,
    now: Date,
  ) {
    if (frequency === ReminderFrequency.ONCE) {
      if (remindAt <= now) {
        throw new AppError(
          'A one-time reminder must be scheduled in the future',
          422,
          ERROR_CODE.REMINDER_SCHEDULE_INVALID,
        );
      }
      return remindAt;
    }

    const next = this.nextOccurrenceAfter(
      remindAt,
      frequency,
      repeatInterval,
      now,
    );
    if (endAt && next > endAt) {
      throw new AppError(
        'The recurring reminder has no future occurrence before endAt',
        422,
        ERROR_CODE.REMINDER_SCHEDULE_INVALID,
      );
    }
    return next;
  }

  private calculateNextTrigger(
    remindAt: Date,
    frequency: ReminderFrequency,
    repeatInterval: number,
    endAt: Date | null,
    now: Date,
  ): Date | null {
    if (frequency === ReminderFrequency.ONCE) {
      return null;
    }
    const next = this.nextOccurrenceAfter(
      remindAt,
      frequency,
      repeatInterval,
      now,
    );
    return endAt && next > endAt ? null : next;
  }

  private nextOccurrenceAfter(
    remindAt: Date,
    frequency: ReminderFrequency,
    repeatInterval: number,
    after: Date,
  ) {
    if (remindAt > after) {
      return remindAt;
    }

    const origin = instantToBusinessWallTime(remindAt);
    const afterWall = instantToBusinessWallTime(after);

    if (frequency === ReminderFrequency.DAILY || frequency === ReminderFrequency.WEEKLY) {
      const stepDays = frequency === ReminderFrequency.DAILY ? repeatInterval : repeatInterval * 7;
      const elapsedDays = Math.floor(
        (businessDateToPrismaDate(afterWall.date).getTime()
          - businessDateToPrismaDate(origin.date).getTime()) / (24 * 60 * 60 * 1000),
      );
      let occurrence = Math.max(1, Math.floor(elapsedDays / stepDays));
      let candidate = businessWallTimeToInstant(
        addBusinessDays(origin.date, occurrence * stepDays), origin.time,
      );
      if (candidate <= after) {
        occurrence += 1;
        candidate = businessWallTimeToInstant(
          addBusinessDays(origin.date, occurrence * stepDays), origin.time,
        );
      }
      return candidate;
    }

    const stepMonths = frequency === ReminderFrequency.MONTHLY
      ? repeatInterval
      : repeatInterval * 12;
    const monthDifference = (
      (Number(afterWall.date.slice(0, 4)) - Number(origin.date.slice(0, 4))) * 12
      + Number(afterWall.date.slice(5, 7))
      - Number(origin.date.slice(5, 7))
    );
    let occurrence = Math.max(1, Math.floor(monthDifference / stepMonths));
    let candidate = businessWallTimeToInstant(
      addBusinessMonthsClamped(origin.date, occurrence * stepMonths), origin.time,
    );
    while (candidate <= after) {
      occurrence += 1;
      candidate = businessWallTimeToInstant(
        addBusinessMonthsClamped(origin.date, occurrence * stepMonths), origin.time,
      );
    }
    return candidate;
  }

  private async findRecord(userId: string, id: string) {
    const reminder = await this.repository.findById(userId, id);
    if (!reminder) {
      throw new AppError('Reminder not found', 404, ERROR_CODE.NOT_FOUND);
    }
    return reminder;
  }

  private toResponse(reminder: ReminderRecord) {
    const { userId: _userId, ...response } = reminder;
    return response;
  }
}
