import type { Holiday, Ticket, User } from '@prisma/client';
import { config } from '../../config/index.js';
import { requireAgent, requireViewer, type GraphQLContext } from '../../auth/context.js';
import { DEFAULT_WORKING_WEEKDAYS } from '../../services/sla/businessHours.js';
import { getDashboard, type TicketDashboard } from '../../services/dashboard/dashboardService.js';
import { listHolidays } from '../../services/holiday/holidayService.js';
import {
  getTicketForViewer,
  listTickets,
  type TicketFilters,
  type TicketPage,
} from '../../services/ticket/ticketService.js';
import { ErrorCode, isAppError } from '../../errors/index.js';
import { assertRole } from '../../validation/index.js';

interface BusinessCalendarInfo {
  timeZone: string;
  startHour: number;
  endHour: number;
  workingWeekdays: number[];
}

export const Query = {
  me: (_parent: unknown, _args: unknown, context: GraphQLContext): User | null => context.viewer,
  tickets: (_parent: unknown, args: TicketFilters, context: GraphQLContext): Promise<TicketPage> =>
    listTickets(context, args),

  ticket: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ): Promise<Ticket | null> => {
    try {
      return await getTicketForViewer(context, args.id);
    } catch (error) {
      if (isAppError(error) && error.extensions['code'] === ErrorCode.TICKET_NOT_FOUND) return null;
      throw error;
    }
  },

  dashboard: (_parent: unknown, _args: unknown, context: GraphQLContext): Promise<TicketDashboard> =>
    getDashboard(context),

  users: (
    _parent: unknown,
    args: { role?: string | null },
    context: GraphQLContext,
  ): Promise<User[]> => {
    requireAgent(context);
    const role = args.role != null ? assertRole(args.role) : null;
    return context.prisma.user.findMany({
      where: role !== null ? { role } : {},
      orderBy: { name: 'asc' },
    });
  },

  holidays: (_parent: unknown, _args: unknown, context: GraphQLContext): Promise<Holiday[]> =>
    listHolidays(context),

  businessCalendar: (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext,
  ): BusinessCalendarInfo => {
    requireViewer(context);
    return {
      timeZone: config.businessTimezone,
      startHour: config.businessStartHour,
      endHour: config.businessEndHour,
      workingWeekdays: [...DEFAULT_WORKING_WEEKDAYS],
    };
  },
};
