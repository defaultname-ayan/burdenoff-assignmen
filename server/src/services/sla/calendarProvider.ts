import { DateTime } from 'luxon';
import type { PrismaClient } from '@prisma/client';
import { config } from '../../config/index.js';
import { createCalendar, type BusinessCalendar } from './businessHours.js';

const CACHE_TTL_MS = 60_000;

let cached: { calendar: BusinessCalendar; loadedAt: number } | null = null;

export function holidayKey(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

export function invalidateCalendarCache(): void {
  cached = null;
}

export async function getBusinessCalendar(
  prisma: PrismaClient,
  now: number = Date.now(),
): Promise<BusinessCalendar> {
  if (cached !== null && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.calendar;
  }
  const holidays = await prisma.holiday.findMany({ select: { date: true } });
  const calendar = createCalendar({
    timeZone: config.businessTimezone,
    startHour: config.businessStartHour,
    endHour: config.businessEndHour,
    holidays: holidays.map((holiday) => holidayKey(holiday.date)),
  });
  cached = { calendar, loadedAt: now };
  return calendar;
}

export function parseHolidayDate(input: string): Date | null {
  const parsed = DateTime.fromFormat(input.trim(), 'yyyy-MM-dd', { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed.toJSDate();
}
