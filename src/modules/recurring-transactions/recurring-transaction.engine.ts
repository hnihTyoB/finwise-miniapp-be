import {
  addBusinessDays,
  addBusinessMonthsClamped,
  BusinessDate,
} from '../../common/date-time/business-time';
import { RecurringTransactionFrequency } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

function monthsBetween(start: BusinessDate, end: BusinessDate) {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth;
}

function daysBetween(start: BusinessDate, end: BusinessDate) {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return Math.floor(
    (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay))
      / DAY_MS,
  );
}

export class RecurringTransactionEngine {
  static occurrenceAt(
    anchorDate: BusinessDate,
    frequency: RecurringTransactionFrequency,
    repeatInterval: number,
    occurrenceIndex: number,
  ): BusinessDate {
    if (occurrenceIndex < 0 || !Number.isInteger(occurrenceIndex)) {
      throw new Error('occurrenceIndex must be a non-negative integer');
    }

    if (frequency === RecurringTransactionFrequency.DAILY) {
      return addBusinessDays(anchorDate, occurrenceIndex * repeatInterval);
    }
    if (frequency === RecurringTransactionFrequency.WEEKLY) {
      return addBusinessDays(anchorDate, occurrenceIndex * repeatInterval * 7);
    }

    const monthStep = frequency === RecurringTransactionFrequency.MONTHLY
      ? repeatInterval
      : repeatInterval * 12;
    return addBusinessMonthsClamped(anchorDate, occurrenceIndex * monthStep);
  }

  static firstOnOrAfter(
    anchorDate: BusinessDate,
    frequency: RecurringTransactionFrequency,
    repeatInterval: number,
    onOrAfter: BusinessDate,
  ): BusinessDate {
    if (anchorDate >= onOrAfter) {
      return anchorDate;
    }

    let occurrenceIndex: number;
    if (
      frequency === RecurringTransactionFrequency.DAILY
      || frequency === RecurringTransactionFrequency.WEEKLY
    ) {
      const stepDays = frequency === RecurringTransactionFrequency.DAILY
        ? repeatInterval
        : repeatInterval * 7;
      occurrenceIndex = Math.max(0, Math.floor(daysBetween(anchorDate, onOrAfter) / stepDays));
    } else {
      const stepMonths = frequency === RecurringTransactionFrequency.MONTHLY
        ? repeatInterval
        : repeatInterval * 12;
      occurrenceIndex = Math.max(0, Math.floor(monthsBetween(anchorDate, onOrAfter) / stepMonths));
    }

    let candidate = this.occurrenceAt(
      anchorDate,
      frequency,
      repeatInterval,
      occurrenceIndex,
    );
    while (candidate < onOrAfter) {
      occurrenceIndex += 1;
      candidate = this.occurrenceAt(
        anchorDate,
        frequency,
        repeatInterval,
        occurrenceIndex,
      );
    }
    return candidate;
  }

  static nextAfter(
    anchorDate: BusinessDate,
    frequency: RecurringTransactionFrequency,
    repeatInterval: number,
    after: BusinessDate,
  ): BusinessDate {
    return this.firstOnOrAfter(
      anchorDate,
      frequency,
      repeatInterval,
      addBusinessDays(after, 1),
    );
  }

  static preview(
    anchorDate: BusinessDate,
    frequency: RecurringTransactionFrequency,
    repeatInterval: number,
    from: BusinessDate,
    count: number,
    endDate: BusinessDate | null,
  ): BusinessDate[] {
    const dates: BusinessDate[] = [];
    let candidate = this.firstOnOrAfter(anchorDate, frequency, repeatInterval, from);

    while (dates.length < count && (!endDate || candidate <= endDate)) {
      dates.push(candidate);
      candidate = this.nextAfter(anchorDate, frequency, repeatInterval, candidate);
    }
    return dates;
  }
}
