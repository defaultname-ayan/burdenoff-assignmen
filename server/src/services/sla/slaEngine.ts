import type { Priority } from '@prisma/client';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  type BusinessCalendar,
} from './businessHours.js';
import { AT_RISK_THRESHOLD, policyFor, type SLAPolicy } from './policies.js';

export type SLAState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET';

export interface SLATargets {
  readonly firstResponseDueAt: Date;
  readonly firstResponseAtRiskAt: Date;
  readonly resolutionDueAt: Date;
  readonly resolutionAtRiskAt: Date;
}

export interface SLAClock {
  readonly dueAt: Date;
  readonly atRiskAt: Date;
  readonly state: SLAState;
  readonly remainingMinutes: number;
  readonly completed: boolean;
  readonly completedAt: Date | null;
}

export interface TicketSLAInput {
  readonly priority: Priority;
  readonly firstResponseDueAt: Date;
  readonly firstResponseAtRiskAt: Date;
  readonly resolutionDueAt: Date;
  readonly resolutionAtRiskAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface SLAInfo {
  readonly policy: SLAPolicy;
  readonly firstResponse: SLAClock;
  readonly resolution: SLAClock;
}

export function computeTargets(
  priority: Priority,
  startedAt: Date,
  cal: BusinessCalendar,
): SLATargets {
  const policy = policyFor(priority);
  return {
    firstResponseDueAt: addBusinessMinutes(startedAt, policy.firstResponseMinutes, cal),
    firstResponseAtRiskAt: addBusinessMinutes(
      startedAt,
      policy.firstResponseMinutes * AT_RISK_THRESHOLD,
      cal,
    ),
    resolutionDueAt: addBusinessMinutes(startedAt, policy.resolutionMinutes, cal),
    resolutionAtRiskAt: addBusinessMinutes(
      startedAt,
      policy.resolutionMinutes * AT_RISK_THRESHOLD,
      cal,
    ),
  };
}

export function computeResolutionTargets(
  priority: Priority,
  startedAt: Date,
  cal: BusinessCalendar,
): Pick<SLATargets, 'resolutionDueAt' | 'resolutionAtRiskAt'> {
  const policy = policyFor(priority);
  return {
    resolutionDueAt: addBusinessMinutes(startedAt, policy.resolutionMinutes, cal),
    resolutionAtRiskAt: addBusinessMinutes(startedAt, policy.resolutionMinutes * AT_RISK_THRESHOLD, cal),
  };
}

function overdue(minutes: number): number {
  return minutes === 0 ? 0 : -minutes;
}

function evaluateClock(
  dueAt: Date,
  atRiskAt: Date,
  completedAt: Date | null,
  now: Date,
  cal: BusinessCalendar,
): SLAClock {
  if (completedAt !== null) {
    const met = completedAt.getTime() <= dueAt.getTime();
    return {
      dueAt,
      atRiskAt,
      state: met ? 'MET' : 'BREACHED',
      remainingMinutes: met
        ? businessMinutesBetween(completedAt, dueAt, cal)
        : overdue(businessMinutesBetween(dueAt, completedAt, cal)),
      completed: true,
      completedAt,
    };
  }

  if (now.getTime() >= dueAt.getTime()) {
    return {
      dueAt,
      atRiskAt,
      state: 'BREACHED',
      remainingMinutes: overdue(businessMinutesBetween(dueAt, now, cal)),
      completed: false,
      completedAt: null,
    };
  }

  const state: SLAState = now.getTime() > atRiskAt.getTime() ? 'AT_RISK' : 'ON_TRACK';
  return {
    dueAt,
    atRiskAt,
    state,
    remainingMinutes: businessMinutesBetween(now, dueAt, cal),
    completed: false,
    completedAt: null,
  };
}

export function computeSLAInfo(ticket: TicketSLAInput, now: Date, cal: BusinessCalendar): SLAInfo {
  return {
    policy: policyFor(ticket.priority),
    firstResponse: evaluateClock(
      ticket.firstResponseDueAt,
      ticket.firstResponseAtRiskAt,
      ticket.firstResponseAt,
      now,
      cal,
    ),
    resolution: evaluateClock(
      ticket.resolutionDueAt,
      ticket.resolutionAtRiskAt,
      ticket.resolvedAt,
      now,
      cal,
    ),
  };
}

const SEVERITY: Readonly<Record<SLAState, number>> = {
  MET: 0,
  ON_TRACK: 1,
  AT_RISK: 2,
  BREACHED: 3,
};

export function overallState(info: SLAInfo): SLAState {
  return SEVERITY[info.firstResponse.state] >= SEVERITY[info.resolution.state]
    ? info.firstResponse.state
    : info.resolution.state;
}
