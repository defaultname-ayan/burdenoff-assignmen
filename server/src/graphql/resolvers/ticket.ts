import type { Comment, Holiday, Ticket, TicketEvent, User } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { getBusinessCalendar, holidayKey } from '../../services/sla/calendarProvider.js';
import {
  computeSLAInfo,
  overallState,
  type SLAClock,
  type SLAInfo,
} from '../../services/sla/slaEngine.js';
import { policyFor } from '../../services/sla/policies.js';
import { iso, isoOrNull } from './types.js';

interface SLAInfoParent extends SLAInfo {
  readonly priority: Ticket['priority'];
}

interface SLAClockParent extends SLAClock {
  readonly budgetMinutes: number;
}

export const TicketResolvers = {
  id: (ticket: Ticket): string => ticket.id,
  createdAt: (ticket: Ticket): string => iso(ticket.createdAt),
  updatedAt: (ticket: Ticket): string => iso(ticket.updatedAt),
  firstResponseAt: (ticket: Ticket): string | null => isoOrNull(ticket.firstResponseAt),
  resolvedAt: (ticket: Ticket): string | null => isoOrNull(ticket.resolvedAt),
  reporter: (ticket: Ticket, _args: unknown, context: GraphQLContext): Promise<User | null> =>
    context.users.load(ticket.reporterId),

  assignee: (ticket: Ticket, _args: unknown, context: GraphQLContext): Promise<User | null> =>
    ticket.assigneeId === null ? Promise.resolve(null) : context.users.load(ticket.assigneeId),

  comments: (ticket: Ticket, _args: unknown, context: GraphQLContext): Promise<Comment[]> =>
    context.prisma.comment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
    }),

  events: (ticket: Ticket, _args: unknown, context: GraphQLContext): Promise<TicketEvent[]> =>
    context.prisma.ticketEvent.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
    }),

  sla: async (ticket: Ticket, _args: unknown, context: GraphQLContext): Promise<SLAInfoParent> => {
    const calendar = await getBusinessCalendar(context.prisma);
    const info = computeSLAInfo(ticket, context.now(), calendar);
    return { ...info, priority: ticket.priority };
  },
};

export const SLAInfoResolvers = {
  firstResponse: (parent: SLAInfoParent): SLAClockParent => ({
    ...parent.firstResponse,
    budgetMinutes: policyFor(parent.priority).firstResponseMinutes,
  }),
  resolution: (parent: SLAInfoParent): SLAClockParent => ({
    ...parent.resolution,
    budgetMinutes: policyFor(parent.priority).resolutionMinutes,
  }),
  overallState: (parent: SLAInfoParent): string => overallState(parent),
  firstResponseDueAt: (parent: SLAInfoParent): string => iso(parent.firstResponse.dueAt),
  resolutionDueAt: (parent: SLAInfoParent): string => iso(parent.resolution.dueAt),
  firstResponseState: (parent: SLAInfoParent): string => parent.firstResponse.state,
  resolutionState: (parent: SLAInfoParent): string => parent.resolution.state,
  firstResponseRemainingMinutes: (parent: SLAInfoParent): number =>
    parent.firstResponse.remainingMinutes,
  resolutionRemainingMinutes: (parent: SLAInfoParent): number => parent.resolution.remainingMinutes,
};

export const SLAClockResolvers = {
  dueAt: (clock: SLAClockParent): string => iso(clock.dueAt),
  atRiskAt: (clock: SLAClockParent): string => iso(clock.atRiskAt),
  completedAt: (clock: SLAClockParent): string | null => isoOrNull(clock.completedAt),
};

export const CommentResolvers = {
  createdAt: (comment: Comment): string => iso(comment.createdAt),
  author: (comment: Comment, _args: unknown, context: GraphQLContext): Promise<User | null> =>
    context.users.load(comment.authorId),
  ticket: (comment: Comment, _args: unknown, context: GraphQLContext): Promise<Ticket | null> =>
    context.prisma.ticket.findUnique({ where: { id: comment.ticketId } }),
};

export const TicketEventResolvers = {
  createdAt: (event: TicketEvent): string => iso(event.createdAt),
};

export const UserResolvers = {
  createdAt: (user: User): string => iso(user.createdAt),
  email: (user: User, _args: unknown, context: GraphQLContext): string | null => {
    if (context.viewer === null) return null;
    if (context.viewer.role === 'AGENT' || context.viewer.id === user.id) return user.email;
    return null;
  },
};

export const HolidayResolvers = {
  date: (holiday: Holiday): string => holidayKey(holiday.date),
};
