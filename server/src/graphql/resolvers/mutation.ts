import type { Comment, Holiday, Priority, Ticket, TicketStatus } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { login, register, type AuthPayload } from '../../services/auth/authService.js';
import { createHoliday, deleteHoliday } from '../../services/holiday/holidayService.js';
import {
  addComment,
  assignTicket,
  changeTicketStatus,
  createTicket,
  resolveTicket,
} from '../../services/ticket/ticketService.js';
import { assertStatus } from '../../validation/index.js';

export const Mutation = {
  register: (
    _parent: unknown,
    args: { name: string; email: string; password: string; role: string; agentCode?: string | null },
    context: GraphQLContext,
  ): Promise<AuthPayload> => register(context, args),

  login: (
    _parent: unknown,
    args: { email: string; password: string },
    context: GraphQLContext,
  ): Promise<AuthPayload> => login(context, args.email, args.password),

  createTicket: (
    _parent: unknown,
    args: { title: string; description: string; priority: Priority },
    context: GraphQLContext,
  ): Promise<Ticket> => createTicket(context, args),

  assignTicket: (
    _parent: unknown,
    args: { ticketId: string; assigneeId: string },
    context: GraphQLContext,
  ): Promise<Ticket> => assignTicket(context, args.ticketId, args.assigneeId),

  changeTicketStatus: (
    _parent: unknown,
    args: { ticketId: string; status: TicketStatus },
    context: GraphQLContext,
  ): Promise<Ticket> => changeTicketStatus(context, args.ticketId, assertStatus(args.status)),

  resolveTicket: (
    _parent: unknown,
    args: { ticketId: string },
    context: GraphQLContext,
  ): Promise<Ticket> => resolveTicket(context, args.ticketId),

  addComment: (
    _parent: unknown,
    args: { ticketId: string; content: string },
    context: GraphQLContext,
  ): Promise<Comment> => addComment(context, args.ticketId, args.content),

  createHoliday: (
    _parent: unknown,
    args: { date: string; name: string },
    context: GraphQLContext,
  ): Promise<Holiday> => createHoliday(context, args.date, args.name),

  deleteHoliday: (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ): Promise<boolean> => deleteHoliday(context, args.id),
};
