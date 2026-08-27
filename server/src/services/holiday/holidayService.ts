import type { Holiday } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { requireAgent, requireViewer } from '../../auth/context.js';
import { ValidationError } from '../../errors/index.js';
import { LIMITS, requireText } from '../../validation/index.js';
import {
  getBusinessCalendar,
  invalidateCalendarCache,
  parseHolidayDate,
} from '../sla/calendarProvider.js';
import { computeResolutionTargets, computeTargets } from '../sla/slaEngine.js';

export async function listHolidays(context: GraphQLContext): Promise<Holiday[]> {
  requireViewer(context);
  return context.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
}

async function recomputeOpenTicketTargets(context: GraphQLContext): Promise<number> {
  invalidateCalendarCache();
  const calendar = await getBusinessCalendar(context.prisma);
  const tickets = await context.prisma.ticket.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    select: {
      id: true,
      priority: true,
      createdAt: true,
      slaStartedAt: true,
      firstResponseAt: true,
    },
  });

  await context.prisma.$transaction(
    tickets.map((ticket) => {
      const resolution = computeResolutionTargets(ticket.priority, ticket.slaStartedAt, calendar);
      if (ticket.firstResponseAt !== null) {
        return context.prisma.ticket.update({ where: { id: ticket.id }, data: resolution });
      }
      const fromCreation = computeTargets(ticket.priority, ticket.createdAt, calendar);
      return context.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          firstResponseDueAt: fromCreation.firstResponseDueAt,
          firstResponseAtRiskAt: fromCreation.firstResponseAtRiskAt,
          ...resolution,
        },
      });
    }),
  );

  return tickets.length;
}

export async function createHoliday(
  context: GraphQLContext,
  dateInput: string,
  nameInput: string,
): Promise<Holiday> {
  requireAgent(context);
  const name = requireText(nameInput, 'name', LIMITS.nameMax);
  const date = parseHolidayDate(dateInput);
  if (date === null) {
    throw new ValidationError('Holiday date must be in YYYY-MM-DD format.', 'date');
  }

  try {
    const holiday = await context.prisma.holiday.create({ data: { date, name } });
    await recomputeOpenTicketTargets(context);
    return holiday;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ValidationError('A holiday is already configured for that date.', 'date');
    }
    throw error;
  }
}

export async function deleteHoliday(context: GraphQLContext, id: string): Promise<boolean> {
  requireAgent(context);
  const deleted = await context.prisma.holiday.deleteMany({ where: { id } });
  if (deleted.count === 0) return false;
  await recomputeOpenTicketTargets(context);
  return true;
}
