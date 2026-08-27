import type { TicketStatus } from '@prisma/client';
import { InvalidStatusTransitionError } from '../../errors/index.js';

export const ALLOWED_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: ['OPEN'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) {
    throw new InvalidStatusTransitionError(from, to);
  }
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}

export function isReopen(from: TicketStatus, to: TicketStatus): boolean {
  return to === 'OPEN' && (from === 'RESOLVED' || from === 'CLOSED');
}
