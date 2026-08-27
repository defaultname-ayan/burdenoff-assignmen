import { ErrorCode, AppError, ValidationError } from '../errors/index.js';
import type { Priority, TicketStatus, UserRole } from '@prisma/client';

export const LIMITS = {
  titleMax: 160,
  descriptionMax: 5000,
  commentMax: 5000,
  nameMax: 120,
  passwordMin: 8,
  passwordMax: 200,
  pageSizeMax: 50,
  pageSizeDefault: 20,
} as const;

export function requireText(
  value: string,
  field: string,
  max: number,
  code: 'VALIDATION_ERROR' | 'INVALID_COMMENT' = ErrorCode.VALIDATION_ERROR,
): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new AppError(code, `${field} must not be empty.`, { field });
  }
  if (trimmed.length > max) {
    throw new AppError(code, `${field} must be at most ${max} characters.`, { field });
  }
  return trimmed;
}

const PRIORITIES: readonly Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const ROLES: readonly UserRole[] = ['REPORTER', 'AGENT'];

export function assertPriority(value: string): Priority {
  if (!PRIORITIES.includes(value as Priority)) {
    throw new AppError(ErrorCode.INVALID_PRIORITY, `"${value}" is not a valid priority.`, {
      field: 'priority',
      details: { allowed: PRIORITIES },
    });
  }
  return value as Priority;
}

export function assertStatus(value: string): TicketStatus {
  if (!STATUSES.includes(value as TicketStatus)) {
    throw new ValidationError(`"${value}" is not a valid ticket status.`, 'status');
  }
  return value as TicketStatus;
}

export function assertRole(value: string): UserRole {
  if (!ROLES.includes(value as UserRole)) {
    throw new ValidationError(`"${value}" is not a valid role.`, 'role');
  }
  return value as UserRole;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function assertEmail(value: string): string {
  const normalised = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalised) || normalised.length > 200) {
    throw new ValidationError('A valid email address is required.', 'email');
  }
  return normalised;
}

export function assertPassword(value: string): string {
  if (value.length < LIMITS.passwordMin) {
    throw new ValidationError(
      `Password must be at least ${LIMITS.passwordMin} characters.`,
      'password',
    );
  }
  if (value.length > LIMITS.passwordMax) {
    throw new ValidationError(`Password must be at most ${LIMITS.passwordMax} characters.`, 'password');
  }
  return value;
}

export function normalisePageSize(take: number | null | undefined): number {
  if (take === null || take === undefined) return LIMITS.pageSizeDefault;
  if (!Number.isInteger(take) || take <= 0) {
    throw new ValidationError('take must be a positive integer.', 'take');
  }
  return Math.min(take, LIMITS.pageSizeMax);
}
