import { GraphQLError } from 'graphql';

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_COMMENT: 'INVALID_COMMENT',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  CONFLICT: 'CONFLICT',
  INVALID_CURSOR: 'INVALID_CURSOR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppErrorOptions {
  readonly field?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class AppError extends GraphQLError {
  constructor(code: ErrorCodeValue, message: string, options: AppErrorOptions = {}) {
    super(message, {
      extensions: {
        code,
        ...(options.field !== undefined ? { field: options.field } : {}),
        ...(options.details !== undefined ? { details: options.details } : {}),
      },
    });
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(ErrorCode.VALIDATION_ERROR, message, field !== undefined ? { field } : {});
  }
}

export class NotFoundError extends AppError {
  constructor(code: typeof ErrorCode.TICKET_NOT_FOUND | typeof ErrorCode.USER_NOT_FOUND, message: string) {
    super(code, message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'You must be signed in to perform this action.') {
    super(ErrorCode.UNAUTHENTICATED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action.') {
    super(ErrorCode.FORBIDDEN, message);
  }
}

export class InvalidStatusTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Ticket cannot transition from ${from} to ${to}.`,
      { details: { from, to } },
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
