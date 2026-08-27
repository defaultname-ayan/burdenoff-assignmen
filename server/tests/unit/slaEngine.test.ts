import { describe, expect, it } from 'bun:test';
import {
  computeResolutionTargets,
  computeSLAInfo,
  computeTargets,
  overallState,
  type TicketSLAInput,
} from '../../src/services/sla/slaEngine.js';
import { DEFAULT_SLA_POLICIES } from '../../src/services/sla/policies.js';
import { at, calendar, local } from './helpers.js';

const cal = calendar();

function ticket(overrides: Partial<TicketSLAInput> & { createdAt?: Date } = {}): TicketSLAInput {
  const createdAt = overrides.createdAt ?? at('2026-03-02T09:00');
  const priority = overrides.priority ?? 'HIGH';
  const targets = computeTargets(priority, createdAt, cal);
  return {
    priority,
    ...targets,
    firstResponseAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

describe('computeTargets', () => {
  it('uses the documented default policies', () => {
    expect(DEFAULT_SLA_POLICIES.URGENT).toEqual({ firstResponseMinutes: 60, resolutionMinutes: 240 });
    expect(DEFAULT_SLA_POLICIES.HIGH).toEqual({ firstResponseMinutes: 240, resolutionMinutes: 1440 });
    expect(DEFAULT_SLA_POLICIES.MEDIUM).toEqual({ firstResponseMinutes: 480, resolutionMinutes: 2880 });
    expect(DEFAULT_SLA_POLICIES.LOW).toEqual({ firstResponseMinutes: 1440, resolutionMinutes: 4320 });
  });

  it('computes the first-response deadline in business hours', () => {
    const targets = computeTargets('HIGH', at('2026-03-06T17:00'), cal);
    expect(local(targets.firstResponseDueAt)).toBe('2026-03-09T12:00');
  });

  it('computes the resolution deadline in business hours', () => {
    const targets = computeTargets('URGENT', at('2026-03-06T17:00'), cal);
    expect(local(targets.resolutionDueAt)).toBe('2026-03-09T12:00');
  });

  it('places the at-risk trip point at 75% of the budget', () => {
    const targets = computeTargets('HIGH', at('2026-03-06T17:00'), cal);
    expect(local(targets.firstResponseAtRiskAt)).toBe('2026-03-09T11:00');
  });

  it('excludes a configured holiday from the deadline', () => {
    const withHoliday = calendar(['2026-03-09']);
    const targets = computeTargets('HIGH', at('2026-03-06T17:00'), withHoliday);
    expect(local(targets.firstResponseDueAt)).toBe('2026-03-10T12:00');
  });
});

describe('SLA state transitions over time', () => {
  const subject = ticket({ createdAt: at('2026-03-06T17:00'), priority: 'HIGH' });

  it('is ON_TRACK early in the budget', () => {
    const info = computeSLAInfo(subject, at('2026-03-09T10:00'), cal);
    expect(info.firstResponse.state).toBe('ON_TRACK');

    expect(info.firstResponse.remainingMinutes).toBe(120);
  });

  it('is still ON_TRACK at exactly 75% consumed', () => {
    const info = computeSLAInfo(subject, at('2026-03-09T11:00'), cal);
    expect(info.firstResponse.state).toBe('ON_TRACK');
    expect(info.firstResponse.remainingMinutes).toBe(60);
  });

  it('becomes AT_RISK past 75% consumed', () => {
    const info = computeSLAInfo(subject, at('2026-03-09T11:30'), cal);
    expect(info.firstResponse.state).toBe('AT_RISK');
    expect(info.firstResponse.remainingMinutes).toBe(30);
  });

  it('becomes BREACHED at the deadline', () => {
    const info = computeSLAInfo(subject, at('2026-03-09T12:00'), cal);
    expect(info.firstResponse.state).toBe('BREACHED');
    expect(info.firstResponse.remainingMinutes).toBe(0);
  });

  it('reports minutes overdue as a negative remaining value', () => {
    const info = computeSLAInfo(subject, at('2026-03-09T14:00'), cal);
    expect(info.firstResponse.state).toBe('BREACHED');
    expect(info.firstResponse.remainingMinutes).toBe(-120);
  });

  it('does not consume budget outside business hours', () => {
    const overnight = computeSLAInfo(subject, at('2026-03-08T23:00'), cal);

    expect(overnight.firstResponse.remainingMinutes).toBe(180);
    expect(overnight.firstResponse.state).toBe('ON_TRACK');
  });
});

describe('SLA clock freezing', () => {
  it('marks a first response inside the budget as MET', () => {
    const responded = ticket({
      createdAt: at('2026-03-02T09:00'),
      priority: 'HIGH',
      firstResponseAt: at('2026-03-02T11:00'),
    });
    const info = computeSLAInfo(responded, at('2026-03-02T12:00'), cal);
    expect(info.firstResponse.state).toBe('MET');
    expect(info.firstResponse.completed).toBe(true);
    expect(info.firstResponse.remainingMinutes).toBe(120);
  });

  it('never lets a met first-response clock become BREACHED later', () => {
    const responded = ticket({
      createdAt: at('2026-03-02T09:00'),
      priority: 'HIGH',
      firstResponseAt: at('2026-03-02T11:00'),
    });

    const info = computeSLAInfo(responded, at('2026-03-13T17:00'), cal);
    expect(info.firstResponse.state).toBe('MET');
    expect(info.firstResponse.remainingMinutes).toBe(120);

    expect(info.resolution.state).toBe('BREACHED');
  });

  it('records a late first response as BREACHED and keeps it frozen', () => {
    const responded = ticket({
      createdAt: at('2026-03-02T09:00'),
      priority: 'HIGH',
      firstResponseAt: at('2026-03-02T15:00'),
    });
    const soon = computeSLAInfo(responded, at('2026-03-02T16:00'), cal);
    const later = computeSLAInfo(responded, at('2026-03-20T16:00'), cal);
    expect(soon.firstResponse.state).toBe('BREACHED');
    expect(soon.firstResponse.remainingMinutes).toBe(-120);

    expect(later.firstResponse.remainingMinutes).toBe(-120);
  });

  it('freezes the resolution clock at resolvedAt', () => {
    const resolved = ticket({
      createdAt: at('2026-03-02T09:00'),
      priority: 'URGENT',
      firstResponseAt: at('2026-03-02T09:30'),
      resolvedAt: at('2026-03-02T12:00'),
    });
    const info = computeSLAInfo(resolved, at('2026-03-20T12:00'), cal);
    expect(info.resolution.state).toBe('MET');
    expect(info.resolution.remainingMinutes).toBe(60);
    expect(overallState(info)).toBe('MET');
  });
});

describe('overall state', () => {
  it('reports the worse of the two clocks', () => {
    const subject = ticket({ createdAt: at('2026-03-02T09:00'), priority: 'URGENT' });

    const info = computeSLAInfo(subject, at('2026-03-02T12:30'), cal);
    expect(info.firstResponse.state).toBe('BREACHED');
    expect(info.resolution.state).toBe('AT_RISK');
    expect(overallState(info)).toBe('BREACHED');
  });
});

describe('reopening a ticket', () => {
  it('restarts only the resolution budget from the reopen instant', () => {
    const reopenedAt = at('2026-03-10T10:00');
    const targets = computeResolutionTargets('URGENT', reopenedAt, cal);
    expect(local(targets.resolutionDueAt)).toBe('2026-03-10T14:00');
    expect(local(targets.resolutionAtRiskAt)).toBe('2026-03-10T13:00');
  });
});
