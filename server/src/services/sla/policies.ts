import type { Priority } from '@prisma/client';

export interface SLAPolicy {
  readonly firstResponseMinutes: number;
  readonly resolutionMinutes: number;
}

const HOUR = 60;

export const DEFAULT_SLA_POLICIES: Readonly<Record<Priority, SLAPolicy>> = {
  URGENT: { firstResponseMinutes: 1 * HOUR, resolutionMinutes: 4 * HOUR },
  HIGH: { firstResponseMinutes: 4 * HOUR, resolutionMinutes: 24 * HOUR },
  MEDIUM: { firstResponseMinutes: 8 * HOUR, resolutionMinutes: 48 * HOUR },
  LOW: { firstResponseMinutes: 24 * HOUR, resolutionMinutes: 72 * HOUR },
};

export const AT_RISK_THRESHOLD = 0.75;

function isPolicyShape(value: unknown): value is SLAPolicy {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['firstResponseMinutes'] === 'number' &&
    typeof candidate['resolutionMinutes'] === 'number' &&
    candidate['firstResponseMinutes'] > 0 &&
    candidate['resolutionMinutes'] > 0
  );
}

export function loadPolicies(rawJson: string | undefined): Readonly<Record<Priority, SLAPolicy>> {
  if (rawJson === undefined || rawJson.trim() === '') return DEFAULT_SLA_POLICIES;

  const parsed: unknown = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('SLA_POLICIES must be a JSON object keyed by priority');
  }

  const overrides = parsed as Record<string, unknown>;
  const merged: Record<Priority, SLAPolicy> = { ...DEFAULT_SLA_POLICIES };
  for (const priority of Object.keys(DEFAULT_SLA_POLICIES) as Priority[]) {
    const override = overrides[priority];
    if (override === undefined) continue;
    if (!isPolicyShape(override)) {
      throw new Error(`SLA_POLICIES.${priority} must be { firstResponseMinutes, resolutionMinutes }`);
    }
    merged[priority] = override;
  }
  return merged;
}

export const slaPolicies: Readonly<Record<Priority, SLAPolicy>> = loadPolicies(process.env['SLA_POLICIES']);

export function policyFor(priority: Priority): SLAPolicy {
  return slaPolicies[priority];
}
