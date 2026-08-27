import type { SLAClock, SLAState } from '@/api/types';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatRelative(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatBusinessDuration(minutes: number): string {
  const total = Math.abs(minutes);
  const days = Math.floor(total / 540);
  const hours = Math.floor((total % 540) / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

export const SLA_LABEL: Record<SLAState, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  BREACHED: 'Breached',
  MET: 'Met',
};

export function describeClock(clock: SLAClock): string {
  if (clock.completed) {
    return clock.state === 'MET'
      ? `Met with ${formatBusinessDuration(clock.remainingMinutes)} to spare`
      : `Missed by ${formatBusinessDuration(clock.remainingMinutes)}`;
  }
  if (clock.state === 'BREACHED') {
    return `Overdue by ${formatBusinessDuration(clock.remainingMinutes)}`;
  }
  return `${formatBusinessDuration(clock.remainingMinutes)} left`;
}
