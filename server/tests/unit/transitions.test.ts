import { describe, expect, it } from 'bun:test';
import type { TicketStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  isReopen,
} from '../../src/services/ticket/transitions.js';
import { AppError, ErrorCode } from '../../src/errors/index.js';

const ALL: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

describe('status transitions', () => {
  it('allows the happy path OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
    expect(canTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('rejects CLOSED -> IN_PROGRESS: a closed ticket must be reopened first', () => {
    expect(canTransition('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(() => assertTransition('CLOSED', 'IN_PROGRESS')).toThrow(
      'Ticket cannot transition from CLOSED to IN_PROGRESS.',
    );
  });

  it('requires a ticket to be resolved before it can be closed', () => {
    expect(canTransition('OPEN', 'CLOSED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'CLOSED')).toBe(false);
    expect(canTransition('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('only allows a reopen out of CLOSED', () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(['OPEN']);
    expect(canTransition('CLOSED', 'OPEN')).toBe(true);
    expect(canTransition('CLOSED', 'RESOLVED')).toBe(false);
  });

  it('rejects a no-op transition to the same status', () => {
    for (const status of ALL) {
      expect(() => assertTransition(status, status)).toThrow();
    }
  });

  it('raises INVALID_STATUS_TRANSITION with both ends in the extensions', () => {
    try {
      assertTransition('CLOSED', 'IN_PROGRESS');
      throw new Error('expected assertTransition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.extensions['code']).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      expect(appError.extensions['details']).toEqual({ from: 'CLOSED', to: 'IN_PROGRESS' });
    }
  });

  it('identifies reopens, which are what restart the resolution clock', () => {
    expect(isReopen('CLOSED', 'OPEN')).toBe(true);
    expect(isReopen('RESOLVED', 'OPEN')).toBe(true);
    expect(isReopen('IN_PROGRESS', 'OPEN')).toBe(false);
    expect(isReopen('OPEN', 'IN_PROGRESS')).toBe(false);
  });
});
