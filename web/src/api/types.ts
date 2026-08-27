export type UserRole = 'REPORTER' | 'AGENT';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SLAState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET';
export type TicketSortOrder = 'NEWEST' | 'OLDEST' | 'PRIORITY' | 'SLA_DUE';

export interface User {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
}

export interface SLAClock {
  dueAt: string;
  state: SLAState;
  remainingMinutes: number;
  completed: boolean;
  completedAt: string | null;
  budgetMinutes: number;
}

export interface SLAInfo {
  firstResponse: SLAClock;
  resolution: SLAClock;
  overallState: SLAState;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: User;
}

export interface TicketEvent {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporter: User;
  assignee: User | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  sla: SLAInfo;
}

export interface TicketDetail extends Ticket {
  comments: Comment[];
  events: TicketEvent[];
}

export interface TicketConnection {
  nodes: Ticket[];
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export interface Dashboard {
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
  unassignedTickets: number;
  totalTickets: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}
