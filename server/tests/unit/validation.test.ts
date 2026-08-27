import { describe, expect, it } from 'bun:test';
import {
  LIMITS,
  assertEmail,
  assertPassword,
  assertPriority,
  assertRole,
  normalisePageSize,
  requireText,
} from '../../src/validation/index.js';
import { AppError, ErrorCode } from '../../src/errors/index.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return String(error.extensions['code']);
    throw error;
  }
  throw new Error('expected the call to throw');
}

describe('free-text validation', () => {
  it('trims and accepts ordinary text', () => {
    expect(requireText('  Payment failed  ', 'title', LIMITS.titleMax)).toBe('Payment failed');
  });

  it('rejects an empty title', () => {
    expect(codeOf(() => requireText('   ', 'title', LIMITS.titleMax))).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('rejects an empty description', () => {
    expect(codeOf(() => requireText('', 'description', LIMITS.descriptionMax))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('rejects an empty comment with its own error code', () => {
    expect(codeOf(() => requireText('  ', 'content', LIMITS.commentMax, ErrorCode.INVALID_COMMENT))).toBe(
      ErrorCode.INVALID_COMMENT,
    );
  });

  it('rejects text over the length limit', () => {
    expect(codeOf(() => requireText('x'.repeat(LIMITS.titleMax + 1), 'title', LIMITS.titleMax))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('tags the offending field so the UI can highlight it', () => {
    try {
      requireText('', 'title', LIMITS.titleMax);
    } catch (error) {
      expect((error as AppError).extensions['field']).toBe('title');
    }
  });
});

describe('enum validation', () => {
  it('accepts every valid priority', () => {
    for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'URGENT']) {
      expect(assertPriority(priority)).toBe(priority as 'LOW');
    }
  });

  it('rejects an unknown priority with INVALID_PRIORITY', () => {
    expect(codeOf(() => assertPriority('CRITICAL'))).toBe(ErrorCode.INVALID_PRIORITY);
    expect(codeOf(() => assertPriority('low'))).toBe(ErrorCode.INVALID_PRIORITY);
  });

  it('rejects an unknown role', () => {
    expect(assertRole('AGENT')).toBe('AGENT');
    expect(codeOf(() => assertRole('ADMIN'))).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

describe('credential validation', () => {
  it('normalises email casing and whitespace', () => {
    expect(assertEmail('  Agent@Example.COM ')).toBe('agent@example.com');
  });

  it('rejects a malformed email', () => {
    expect(codeOf(() => assertEmail('not-an-email'))).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('enforces a minimum password length', () => {
    expect(codeOf(() => assertPassword('short'))).toBe(ErrorCode.VALIDATION_ERROR);
    expect(assertPassword('password123')).toBe('password123');
  });
});

describe('page size', () => {
  it('defaults when omitted and clamps to the maximum', () => {
    expect(normalisePageSize(null)).toBe(LIMITS.pageSizeDefault);
    expect(normalisePageSize(5)).toBe(5);
    expect(normalisePageSize(1000)).toBe(LIMITS.pageSizeMax);
  });

  it('rejects a non-positive page size', () => {
    expect(codeOf(() => normalisePageSize(0))).toBe(ErrorCode.VALIDATION_ERROR);
    expect(codeOf(() => normalisePageSize(-3))).toBe(ErrorCode.VALIDATION_ERROR);
  });
});
