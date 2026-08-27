import type { Prisma, PrismaClient } from '@prisma/client';
import type { SLAState } from '../sla/slaEngine.js';

interface ClockColumns {
  readonly completedAt: 'firstResponseAt' | 'resolvedAt';
  readonly dueAt: 'firstResponseDueAt' | 'resolutionDueAt';
  readonly atRiskAt: 'firstResponseAtRiskAt' | 'resolutionAtRiskAt';
}

const FIRST_RESPONSE: ClockColumns = {
  completedAt: 'firstResponseAt',
  dueAt: 'firstResponseDueAt',
  atRiskAt: 'firstResponseAtRiskAt',
};

const RESOLUTION: ClockColumns = {
  completedAt: 'resolvedAt',
  dueAt: 'resolutionDueAt',
  atRiskAt: 'resolutionAtRiskAt',
};

function clockIs(
  prisma: PrismaClient,
  cols: ClockColumns,
  state: SLAState,
  now: Date,
): Prisma.TicketWhereInput {
  const dueField = prisma.ticket.fields[cols.dueAt];

  switch (state) {
    case 'MET':
      return { [cols.completedAt]: { not: null, lte: dueField } } as Prisma.TicketWhereInput;
    case 'BREACHED':
      return {
        OR: [
          { [cols.completedAt]: { not: null, gt: dueField } },
          { [cols.completedAt]: null, [cols.dueAt]: { lte: now } },
        ],
      } as Prisma.TicketWhereInput;
    case 'AT_RISK':
      return {
        [cols.completedAt]: null,
        [cols.dueAt]: { gt: now },
        [cols.atRiskAt]: { lt: now },
      } as Prisma.TicketWhereInput;
    case 'ON_TRACK':
      return {
        [cols.completedAt]: null,
        [cols.dueAt]: { gt: now },
        [cols.atRiskAt]: { gte: now },
      } as Prisma.TicketWhereInput;
  }
}

function eitherClockIs(prisma: PrismaClient, state: SLAState, now: Date): Prisma.TicketWhereInput {
  return {
    OR: [clockIs(prisma, FIRST_RESPONSE, state, now), clockIs(prisma, RESOLUTION, state, now)],
  };
}

export function slaStateWhere(
  prisma: PrismaClient,
  state: SLAState,
  now: Date,
): Prisma.TicketWhereInput {
  switch (state) {
    case 'BREACHED':
      return eitherClockIs(prisma, 'BREACHED', now);
    case 'AT_RISK':
      return {
        AND: [
          eitherClockIs(prisma, 'AT_RISK', now),
          { NOT: eitherClockIs(prisma, 'BREACHED', now) },
        ],
      };
    case 'ON_TRACK':
      return {
        AND: [
          eitherClockIs(prisma, 'ON_TRACK', now),
          { NOT: eitherClockIs(prisma, 'BREACHED', now) },
          { NOT: eitherClockIs(prisma, 'AT_RISK', now) },
        ],
      };
    case 'MET':
      return {
        AND: [
          clockIs(prisma, FIRST_RESPONSE, 'MET', now),
          clockIs(prisma, RESOLUTION, 'MET', now),
        ],
      };
  }
}
