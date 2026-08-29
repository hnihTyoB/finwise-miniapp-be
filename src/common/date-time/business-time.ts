export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh' as const;

export type BusinessDate = `${number}-${number}-${number}`;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function partsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function assertBusinessDate(value: string): BusinessDate {
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format');
  }

  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    throw new Error('Date must be a valid calendar date');
  }

  return value as BusinessDate;
}

export function businessDateToPrismaDate(value: string): Date {
  const date = assertBusinessDate(value);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function prismaDateToBusinessDate(value: Date): BusinessDate {
  return value.toISOString().slice(0, 10) as BusinessDate;
}

export function instantToBusinessDate(
  instant: Date,
  timeZone = BUSINESS_TIME_ZONE,
): BusinessDate {
  const parts = partsAt(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}` as BusinessDate;
}

export function instantToBusinessWallTime(
  instant: Date,
  timeZone = BUSINESS_TIME_ZONE,
): { date: BusinessDate; time: string } {
  const parts = partsAt(instant, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as BusinessDate,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function businessWallTimeToInstant(
  date: string,
  time = '00:00:00',
  timeZone = BUSINESS_TIME_ZONE,
): Date {
  const businessDate = assertBusinessDate(date);
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error('Time must use HH:mm or HH:mm:ss format');

  const [year, month, day] = businessDate.split('-').map(Number);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error('Time is invalid');

  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(wallClockUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const zoned = partsAt(candidate, timeZone);
    const representedAsUtc = Date.UTC(
      Number(zoned.year), Number(zoned.month) - 1, Number(zoned.day),
      Number(zoned.hour), Number(zoned.minute), Number(zoned.second),
    );
    candidate = new Date(candidate.getTime() + wallClockUtc - representedAsUtc);
  }

  return candidate;
}

export function addBusinessDays(value: string, amount: number): BusinessDate {
  const date = businessDateToPrismaDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return prismaDateToBusinessDate(date);
}

export function addBusinessMonthsClamped(value: string, months: number): BusinessDate {
  const source = businessDateToPrismaDate(value);
  const day = source.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(
    source.getUTCFullYear(), source.getUTCMonth() + months, 1,
  ));
  const lastDay = new Date(Date.UTC(
    firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0,
  )).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return prismaDateToBusinessDate(firstOfTarget);
}

export function formatInstantInBusinessTime(instant: Date, locale = 'vi-VN'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(instant);
}

export function timeZoneOffsetMinutesAt(
  instant: Date,
  timeZone = BUSINESS_TIME_ZONE,
): number {
  const zoned = partsAt(instant, timeZone);
  const representedAsUtc = Date.UTC(
    Number(zoned.year), Number(zoned.month) - 1, Number(zoned.day),
    Number(zoned.hour), Number(zoned.minute), Number(zoned.second),
  );
  return Math.round((representedAsUtc - instant.getTime()) / 60_000);
}
