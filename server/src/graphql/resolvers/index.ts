import { Query } from './query.js';
import { Mutation } from './mutation.js';
import {
  CommentResolvers,
  HolidayResolvers,
  SLAClockResolvers,
  SLAInfoResolvers,
  TicketEventResolvers,
  TicketResolvers,
  UserResolvers,
} from './ticket.js';

export const resolvers = {
  Query,
  Mutation,
  Ticket: TicketResolvers,
  SLAInfo: SLAInfoResolvers,
  SLAClock: SLAClockResolvers,
  Comment: CommentResolvers,
  TicketEvent: TicketEventResolvers,
  User: UserResolvers,
  Holiday: HolidayResolvers,
};
