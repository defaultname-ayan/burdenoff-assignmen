import { DateTime, Interval } from 'luxon';

export interface BusinessCalendar {
  readonly timeZone: string;
  readonly startHour: number;
  readonly endHour: number;
  readonly workingWeekdays: readonly number[];
  readonly holidays: ReadonlySet<string>;
}

export const DEFAULT_WORKING_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

const MAX_DAYS_SCANNED = 3650;

export function createCalendar(params: {
  timeZone: string;
  startHour: number;
  endHour: number;
  holidays?: Iterable<string>;
  workingWeekdays?: readonly number[];
}): BusinessCalendar {
  return {
    timeZone: params.timeZone,
    startHour: params.startHour,
    endHour: params.endHour,
    workingWeekdays: params.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS,
    holidays: new Set(params.holidays ?? []),
  };
}

function toZone(instant: Date, cal: BusinessCalendar): DateTime {
  return DateTime.fromJSDate(instant, { zone: cal.timeZone });
}

export function isWorkingDay(day: DateTime, cal: BusinessCalendar): boolean {
  if (!cal.workingWeekdays.includes(day.weekday)) return false;
  return !cal.holidays.has(day.toFormat('yyyy-MM-dd'));
}

function windowFor(day: DateTime, cal: BusinessCalendar): Interval | null {
  if (!isWorkingDay(day, cal)) return null;
  const open = day.startOf('day').set({ hour: cal.startHour });
  const close = day.startOf('day').set({ hour: cal.endHour });
  return Interval.fromDateTimes(open, close);
}

function nextWorkingDayOpen(day: DateTime, cal: BusinessCalendar): DateTime {
  let cursor: DateTime = day.plus({ days: 1 }).startOf('day');
  for (let i = 0; i < MAX_DAYS_SCANNED; i += 1) {
    if (isWorkingDay(cursor, cal)) return cursor.set({ hour: cal.startHour });
    cursor = cursor.plus({ days: 1 }).startOf('day');
  }
  throw new Error('No working day found within the scan limit.');
}

export function nextBusinessInstant(instant: Date, cal: BusinessCalendar): Date {
  let cursor: DateTime = toZone(instant, cal);
  for (let i = 0; i < MAX_DAYS_SCANNED; i += 1) {
    const window = windowFor(cursor, cal);
    if (window !== null) {
      const open = window.start;
      const close = window.end;
      if (open === null || close === null) throw new Error('Invalid business window');
      if (cursor < open) return open.toJSDate();
      if (cursor < close) return cursor.toJSDate();
    }
    cursor = nextWorkingDayOpen(cursor, cal);
  }
  throw new Error('Could not find a business instant within the scan limit.');
}

export function businessMinutesBetween(from: Date, to: Date, cal: BusinessCalendar): number {
  if (to.getTime() <= from.getTime()) return 0;

  const start = toZone(from, cal);
  const end = toZone(to, cal);
  const span = Interval.fromDateTimes(start, end);

  let total = 0;
  let day: DateTime = start.startOf('day');
  for (let i = 0; i < MAX_DAYS_SCANNED; i += 1) {
    if (day > end) break;
    const window = windowFor(day, cal);
    if (window !== null) {
      const overlap = span.intersection(window);
      if (overlap !== null) total += overlap.length('minutes');
    }
    day = day.plus({ days: 1 }).startOf('day');
  }
  return Math.round(total);
}

export function addBusinessMinutes(from: Date, minutes: number, cal: BusinessCalendar): Date {
  if (minutes < 0) throw new Error('addBusinessMinutes does not support negative durations');

  let cursor: DateTime = DateTime.fromJSDate(nextBusinessInstant(from, cal), { zone: cal.timeZone });
  let remaining = minutes;

  for (let i = 0; i < MAX_DAYS_SCANNED; i += 1) {
    const window = windowFor(cursor, cal);
    if (window === null) {
      cursor = nextWorkingDayOpen(cursor, cal);
      continue;
    }
    const close = window.end;
    if (close === null) throw new Error('Invalid business window');

    const availableToday = close.diff(cursor, 'minutes').minutes;
    if (remaining <= availableToday) {
      return cursor.plus({ minutes: remaining }).toJSDate();
    }
    remaining -= availableToday;
    cursor = nextWorkingDayOpen(cursor, cal);
  }
  throw new Error('Could not resolve the business deadline within the scan limit.');
}

export function businessMinutesPerDay(cal: BusinessCalendar): number {
  return (cal.endHour - cal.startHour) * 60;
}
