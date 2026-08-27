import type { Prisma } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { requireViewer } from '../../auth/context.js';
import { slaStateWhere } from '../ticket/ticketFilters.js';

export interface TicketDashboard {
  readonly openTickets: number;
  readonly inProgressTickets: number;
  readonly resolvedTickets: number;
  readonly atRiskTickets: number;
  readonly breachedTickets: number;
  readonly unassignedTickets: number;
  readonly totalTickets: number;
}

export async function getDashboard(context: GraphQLContext): Promise<TicketDashboard> {
  const viewer = requireViewer(context);
  const now = context.now();
  const scope: Prisma.TicketWhereInput = viewer.role === 'AGENT' ? {} : { reporterId: viewer.id };

  const and = (extra: Prisma.TicketWhereInput): Prisma.TicketWhereInput => ({ AND: [scope, extra] });

  const [openTickets, inProgressTickets, resolvedTickets, atRiskTickets, breachedTickets, unassignedTickets, totalTickets] =
    await Promise.all([
      context.prisma.ticket.count({ where: and({ status: 'OPEN' }) }),
      context.prisma.ticket.count({ where: and({ status: 'IN_PROGRESS' }) }),
      context.prisma.ticket.count({ where: and({ status: 'RESOLVED' }) }),
      context.prisma.ticket.count({
        where: { AND: [scope, slaStateWhere(context.prisma, 'AT_RISK', now)] },
      }),
      context.prisma.ticket.count({
        where: { AND: [scope, slaStateWhere(context.prisma, 'BREACHED', now)] },
      }),
      context.prisma.ticket.count({ where: and({ assigneeId: null, status: { not: 'CLOSED' } }) }),
      context.prisma.ticket.count({ where: scope }),
    ]);

  return {
    openTickets,
    inProgressTickets,
    resolvedTickets,
    atRiskTickets,
    breachedTickets,
    unassignedTickets,
    totalTickets,
  };
}
