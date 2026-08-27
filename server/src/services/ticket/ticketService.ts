import type { Prisma, Priority, Ticket, TicketStatus, User } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { requireAgent, requireViewer } from '../../auth/context.js';
import {
  AppError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { LIMITS, assertPriority, normalisePageSize, requireText } from '../../validation/index.js';
import { getBusinessCalendar } from '../sla/calendarProvider.js';
import { computeResolutionTargets, computeTargets, type SLAState } from '../sla/slaEngine.js';
import { assertTransition, isReopen } from './transitions.js';
import { slaStateWhere } from './ticketFilters.js';

export type TicketSortOrder = 'NEWEST' | 'OLDEST' | 'PRIORITY' | 'SLA_DUE';

export interface TicketFilters {
  readonly status?: TicketStatus | null;
  readonly priority?: Priority | null;
  readonly assigneeId?: string | null;
  readonly slaState?: SLAState | null;
  readonly search?: string | null;
  readonly orderBy?: TicketSortOrder | null;
  readonly take?: number | null;
  readonly cursor?: string | null;
}

export interface TicketPage {
  readonly nodes: Ticket[];
  readonly pageInfo: { hasNextPage: boolean; endCursor: string | null };
  readonly totalCount: number;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (decoded === '') {
    throw new AppError(ErrorCode.INVALID_CURSOR, 'The supplied cursor is not valid.', {
      field: 'cursor',
    });
  }
  return decoded;
}

function visibilityWhere(viewer: User): Prisma.TicketWhereInput {
  return viewer.role === 'AGENT' ? {} : { reporterId: viewer.id };
}

const PRIORITY_RANK: readonly Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function prioritiesBelow(priority: Priority): Priority[] {
  return PRIORITY_RANK.slice(0, PRIORITY_RANK.indexOf(priority));
}

function keysetWhere(order: TicketSortOrder, cursor: Ticket): Prisma.TicketWhereInput {
  switch (order) {
    case 'NEWEST':
      return {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    case 'OLDEST':
      return {
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      };
    case 'SLA_DUE':
      return {
        OR: [
          { resolutionDueAt: { gt: cursor.resolutionDueAt } },
          { resolutionDueAt: cursor.resolutionDueAt, id: { gt: cursor.id } },
        ],
      };
    case 'PRIORITY':
      return {
        OR: [
          { priority: { in: prioritiesBelow(cursor.priority) } },
          { priority: cursor.priority, createdAt: { gt: cursor.createdAt } },
          { priority: cursor.priority, createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      };
  }
}

function orderFor(order: TicketSortOrder): Prisma.TicketOrderByWithRelationInput[] {
  switch (order) {
    case 'OLDEST':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'PRIORITY':

      return [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];
    case 'SLA_DUE':
      return [{ resolutionDueAt: 'asc' }, { id: 'asc' }];
    case 'NEWEST':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

export async function listTickets(
  context: GraphQLContext,
  filters: TicketFilters,
): Promise<TicketPage> {
  const viewer = requireViewer(context);
  const take = normalisePageSize(filters.take);
  const now = context.now();

  const conditions: Prisma.TicketWhereInput[] = [visibilityWhere(viewer)];
  if (filters.status != null) conditions.push({ status: filters.status });
  if (filters.priority != null) conditions.push({ priority: filters.priority });
  if (filters.assigneeId != null) conditions.push({ assigneeId: filters.assigneeId });
  if (filters.slaState != null) {
    conditions.push(slaStateWhere(context.prisma, filters.slaState, now));
  }
  if (filters.search != null && filters.search.trim() !== '') {
    const term = escapeLike(filters.search.trim().slice(0, LIMITS.titleMax));
    conditions.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    });
  }

  const order = filters.orderBy ?? 'NEWEST';
  let keyset: Prisma.TicketWhereInput | null = null;
  const cursorId = filters.cursor != null && filters.cursor !== '' ? decodeCursor(filters.cursor) : null;

  if (cursorId !== null) {
    const cursorRow = await context.prisma.ticket.findFirst({
      where: { AND: [visibilityWhere(viewer), { id: cursorId }] },
    });
    if (cursorRow === null) {
      throw new AppError(ErrorCode.INVALID_CURSOR, 'The supplied cursor is not valid.', {
        field: 'cursor',
      });
    }
    keyset = keysetWhere(order, cursorRow);
  }

  const filterWhere: Prisma.TicketWhereInput = { AND: conditions };
  const pageWhere: Prisma.TicketWhereInput =
    keyset === null ? filterWhere : { AND: [...conditions, keyset] };

  const [rows, totalCount] = await Promise.all([
    context.prisma.ticket.findMany({
      where: pageWhere,
      orderBy: orderFor(order),
      take: take + 1,
    }),
    context.prisma.ticket.count({ where: filterWhere }),
  ]);

  const hasNextPage = rows.length > take;
  const nodes = hasNextPage ? rows.slice(0, take) : rows;
  const last = nodes.at(-1);

  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor: last !== undefined ? encodeCursor(last.id) : null,
    },
    totalCount,
  };
}

export async function getTicketForViewer(context: GraphQLContext, ticketId: string): Promise<Ticket> {
  const viewer = requireViewer(context);
  const ticket = await context.prisma.ticket.findUnique({ where: { id: ticketId } });
  if (ticket === null) {
    throw new NotFoundError(ErrorCode.TICKET_NOT_FOUND, `Ticket ${ticketId} does not exist.`);
  }

  if (viewer.role !== 'AGENT' && ticket.reporterId !== viewer.id) {
    throw new NotFoundError(ErrorCode.TICKET_NOT_FOUND, `Ticket ${ticketId} does not exist.`);
  }
  return ticket;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly priority: string;
}

export async function createTicket(
  context: GraphQLContext,
  input: CreateTicketInput,
): Promise<Ticket> {
  const viewer = requireViewer(context);
  const title = requireText(input.title, 'title', LIMITS.titleMax);
  const description = requireText(input.description, 'description', LIMITS.descriptionMax);
  const priority = assertPriority(input.priority);

  const calendar = await getBusinessCalendar(context.prisma);
  const createdAt = context.now();
  const targets = computeTargets(priority, createdAt, calendar);

  return context.prisma.ticket.create({
    data: {
      title,
      description,
      priority,
      status: 'OPEN',
      reporterId: viewer.id,
      createdAt,
      slaStartedAt: createdAt,
      ...targets,
    },
  });
}

export async function assignTicket(
  context: GraphQLContext,
  ticketId: string,
  assigneeId: string,
): Promise<Ticket> {
  const actor = requireAgent(context);
  const ticket = await getTicketForViewer(context, ticketId);

  const assignee = await context.prisma.user.findUnique({ where: { id: assigneeId } });
  if (assignee === null) {
    throw new NotFoundError(ErrorCode.USER_NOT_FOUND, `User ${assigneeId} does not exist.`);
  }
  if (assignee.role !== 'AGENT') {
    throw new ValidationError('Tickets can only be assigned to agents.', 'assigneeId');
  }
  if (ticket.status === 'CLOSED') {
    throw new ForbiddenError('A closed ticket must be reopened before it can be reassigned.');
  }
  if (ticket.assigneeId === assigneeId) return ticket;

  return context.prisma.$transaction(async (tx) => {
    const changed = await tx.ticket.updateMany({
      where: { id: ticket.id, assigneeId: ticket.assigneeId, status: ticket.status },
      data: { assigneeId },
    });
    if (changed.count === 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This ticket was changed by someone else. Reload and try again.',
      );
    }
    await tx.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        type: 'ASSIGNEE_CHANGED',
        fromValue: ticket.assigneeId,
        toValue: assigneeId,
      },
    });
    return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  });
}

export async function changeTicketStatus(
  context: GraphQLContext,
  ticketId: string,
  status: TicketStatus,
): Promise<Ticket> {
  const actor = requireAgent(context);
  const ticket = await getTicketForViewer(context, ticketId);
  assertTransition(ticket.status, status);

  const now = context.now();
  const data: Prisma.TicketUpdateInput = { status };

  if (status === 'RESOLVED') {
    data.resolvedAt = ticket.resolvedAt ?? now;
  }

  if (isReopen(ticket.status, status)) {
    const calendar = await getBusinessCalendar(context.prisma);
    Object.assign(data, computeResolutionTargets(ticket.priority, now, calendar), {
      resolvedAt: null,
      slaStartedAt: now,
    });
  }

  return context.prisma.$transaction(async (tx) => {
    const changed = await tx.ticket.updateMany({
      where: { id: ticket.id, status: ticket.status },
      data,
    });
    if (changed.count === 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This ticket was changed by someone else. Reload and try again.',
      );
    }
    await tx.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        type: 'STATUS_CHANGED',
        fromValue: ticket.status,
        toValue: status,
      },
    });
    return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  });
}

export async function resolveTicket(context: GraphQLContext, ticketId: string): Promise<Ticket> {
  return changeTicketStatus(context, ticketId, 'RESOLVED');
}

export async function addComment(context: GraphQLContext, ticketId: string, content: string) {
  const viewer = requireViewer(context);
  const body = requireText(content, 'content', LIMITS.commentMax, ErrorCode.INVALID_COMMENT);
  const ticket = await getTicketForViewer(context, ticketId);

  if (ticket.status === 'CLOSED') {
    throw new ForbiddenError('A closed ticket must be reopened before new comments can be added.');
  }

  const now = context.now();

  return context.prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { ticketId: ticket.id, authorId: viewer.id, content: body, createdAt: now },
    });

    if (ticket.firstResponseAt === null && viewer.id !== ticket.reporterId) {
      await tx.ticket.updateMany({
        where: { id: ticket.id, firstResponseAt: null },
        data: { firstResponseAt: comment.createdAt },
      });
    }

    return comment;
  });
}
