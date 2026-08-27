import { DateTime } from 'luxon';
import { createCalendar, type BusinessCalendar } from '../../src/services/sla/businessHours.js';

export const TZ = 'Asia/Kolkata';

export function at(local: string): Date {
  const parsed = DateTime.fromISO(local, { zone: TZ });
  if (!parsed.isValid) throw new Error(`Invalid test date: ${local}`);
  return parsed.toJSDate();
}

export function local(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: TZ }).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function calendar(holidays: string[] = []): BusinessCalendar {
  return createCalendar({ timeZone: TZ, startHour: 9, endHour: 18, holidays });
}
