import type { Comment, Holiday, Ticket, TicketEvent, User } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';

export type Resolver<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
) => TResult | Promise<TResult>;

export type { Comment, Holiday, Ticket, TicketEvent, User, GraphQLContext };

export function iso(value: Date): string {
  return value.toISOString();
}

export function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
