import { describe, expect, it } from 'bun:test';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  businessMinutesPerDay,
  nextBusinessInstant,
} from '../../src/services/sla/businessHours.js';
import { at, calendar, local } from './helpers.js';

const cal = calendar();

describe('business day shape', () => {
  it('is nine business hours long', () => {
    expect(businessMinutesPerDay(cal)).toBe(540);
  });
});

describe('nextBusinessInstant', () => {
  it('leaves an instant inside business hours untouched', () => {
    expect(local(nextBusinessInstant(at('2026-03-02T10:30'), cal))).toBe('2026-03-02T10:30');
  });

  it('moves a ticket created before business hours to the opening bell', () => {
    expect(local(nextBusinessInstant(at('2026-03-02T07:00'), cal))).toBe('2026-03-02T09:00');
  });

  it('moves a ticket created after business hours to the next morning', () => {
    expect(local(nextBusinessInstant(at('2026-03-02T20:00'), cal))).toBe('2026-03-03T09:00');
  });

  it('treats 18:00 as already outside the day', () => {
    expect(local(nextBusinessInstant(at('2026-03-02T18:00'), cal))).toBe('2026-03-03T09:00');
  });

  it('skips the weekend', () => {
    expect(local(nextBusinessInstant(at('2026-03-07T12:00'), cal))).toBe('2026-03-09T09:00');
    expect(local(nextBusinessInstant(at('2026-03-08T12:00'), cal))).toBe('2026-03-09T09:00');
  });

  it('skips a configured holiday', () => {
    const withHoliday = calendar(['2026-03-09']);
    expect(local(nextBusinessInstant(at('2026-03-07T12:00'), withHoliday))).toBe('2026-03-10T09:00');
  });
});

describe('addBusinessMinutes', () => {
  it('adds within a single working day', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T10:00'), 240, cal))).toBe('2026-03-02T14:00');
  });

  it('starts counting at 09:00 for a ticket raised before business hours', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T07:00'), 60, cal))).toBe('2026-03-02T10:00');
  });

  it('starts counting the next morning for a ticket raised after business hours', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T20:00'), 60, cal))).toBe('2026-03-03T10:00');
  });

  it('starts counting on Monday for a ticket raised at the weekend', () => {
    expect(local(addBusinessMinutes(at('2026-03-07T13:00'), 120, cal))).toBe('2026-03-09T11:00');
  });

  it('rolls a Friday evening HIGH ticket over the weekend (the brief example)', () => {
    expect(local(addBusinessMinutes(at('2026-03-06T17:00'), 240, cal))).toBe('2026-03-09T12:00');
  });

  it('counts only one minute of a ticket raised at Friday 17:59', () => {
    const due = addBusinessMinutes(at('2026-03-06T17:59'), 61, cal);

    expect(local(due)).toBe('2026-03-09T10:00');
  });

  it('skips a holiday that falls on the next working day', () => {
    const withHoliday = calendar(['2026-03-09']);
    expect(local(addBusinessMinutes(at('2026-03-06T17:00'), 240, withHoliday))).toBe(
      '2026-03-10T12:00',
    );
  });

  it('skips a weekend and a holiday back to back', () => {
    const withHolidays = calendar(['2026-03-09', '2026-03-10']);
    expect(local(addBusinessMinutes(at('2026-03-06T17:30'), 60, withHolidays))).toBe(
      '2026-03-11T09:30',
    );
  });

  it('crosses several business days for a long budget', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T10:00'), 24 * 60, cal))).toBe('2026-03-04T16:00');
  });

  it('lands exactly on closing time when the budget fills the day', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T09:00'), 540, cal))).toBe('2026-03-02T18:00');
  });

  it('spans a 72 business hour (LOW) budget across two weeks', () => {
    expect(local(addBusinessMinutes(at('2026-03-02T09:00'), 72 * 60, cal))).toBe('2026-03-11T18:00');
  });
});

describe('businessMinutesBetween', () => {
  it('returns zero when the range is empty or inverted', () => {
    expect(businessMinutesBetween(at('2026-03-02T12:00'), at('2026-03-02T12:00'), cal)).toBe(0);
    expect(businessMinutesBetween(at('2026-03-02T13:00'), at('2026-03-02T12:00'), cal)).toBe(0);
  });

  it('measures a plain weekday range', () => {
    expect(businessMinutesBetween(at('2026-03-02T10:00'), at('2026-03-02T12:30'), cal)).toBe(150);
  });

  it('ignores the overnight gap', () => {
    expect(businessMinutesBetween(at('2026-03-02T17:00'), at('2026-03-03T10:00'), cal)).toBe(120);
  });

  it('counts only one minute across a Friday 17:59 weekend boundary', () => {
    expect(businessMinutesBetween(at('2026-03-06T17:59'), at('2026-03-08T23:00'), cal)).toBe(1);
  });

  it('ignores the whole weekend', () => {
    expect(businessMinutesBetween(at('2026-03-06T16:00'), at('2026-03-09T10:00'), cal)).toBe(180);
  });

  it('ignores a configured holiday', () => {
    const withHoliday = calendar(['2026-03-03']);

    expect(businessMinutesBetween(at('2026-03-02T17:00'), at('2026-03-04T10:00'), withHoliday)).toBe(120);
  });

  it('clamps a range that lies entirely outside business hours to zero', () => {
    expect(businessMinutesBetween(at('2026-03-07T09:00'), at('2026-03-08T18:00'), cal)).toBe(0);
    expect(businessMinutesBetween(at('2026-03-02T19:00'), at('2026-03-02T23:00'), cal)).toBe(0);
  });
});
