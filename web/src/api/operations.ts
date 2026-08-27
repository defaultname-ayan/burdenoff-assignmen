import { request } from './client.js';
import type {
  AuthPayload,
  Comment,
  Dashboard,
  Holiday,
  Priority,
  SLAState,
  Ticket,
  TicketConnection,
  TicketDetail,
  TicketSortOrder,
  TicketStatus,
  User,
  UserRole,
} from './types.js';

const USER_FIELDS = `
  id
  name
  email
  role
`;

const SLA_FIELDS = `
  overallState
  firstResponse { dueAt state remainingMinutes completed completedAt budgetMinutes }
  resolution { dueAt state remainingMinutes completed completedAt budgetMinutes }
`;

const TICKET_FIELDS = `
  id
  number
  title
  description
  priority
  status
  createdAt
  firstResponseAt
  resolvedAt
  reporter { ${USER_FIELDS} }
  assignee { ${USER_FIELDS} }
  sla { ${SLA_FIELDS} }
`;

export interface TicketQueryVariables {
  status?: TicketStatus | null;
  priority?: Priority | null;
  assigneeId?: string | null;
  slaState?: SLAState | null;
  search?: string | null;
  orderBy?: TicketSortOrder;
  take?: number;
  cursor?: string | null;
}

export async function fetchTickets(variables: TicketQueryVariables): Promise<TicketConnection> {
  const data = await request<{ tickets: TicketConnection }>(
    `query Tickets($status: TicketStatus, $priority: Priority, $assigneeId: ID, $slaState: SLAState,
                   $search: String, $orderBy: TicketSortOrder, $take: Int, $cursor: String) {
      tickets(status: $status, priority: $priority, assigneeId: $assigneeId, slaState: $slaState,
              search: $search, orderBy: $orderBy, take: $take, cursor: $cursor) {
        nodes { ${TICKET_FIELDS} }
        totalCount
        pageInfo { hasNextPage endCursor }
      }
    }`,
    variables as Record<string, unknown>,
  );
  return data.tickets;
}

export async function fetchTicket(id: string): Promise<TicketDetail | null> {
  const data = await request<{ ticket: TicketDetail | null }>(
    `query Ticket($id: ID!) {
      ticket(id: $id) {
        ${TICKET_FIELDS}
        comments { id content createdAt author { ${USER_FIELDS} } }
        events { id type fromValue toValue createdAt }
      }
    }`,
    { id },
  );
  return data.ticket;
}

export async function fetchDashboard(): Promise<Dashboard> {
  const data = await request<{ dashboard: Dashboard }>(
    `query Dashboard {
      dashboard {
        openTickets inProgressTickets resolvedTickets
        atRiskTickets breachedTickets unassignedTickets totalTickets
      }
    }`,
  );
  return data.dashboard;
}

export async function fetchAgents(): Promise<User[]> {
  const data = await request<{ users: User[] }>(
    `query Agents { users(role: AGENT) { ${USER_FIELDS} } }`,
  );
  return data.users;
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const data = await request<{ holidays: Holiday[] }>(`query Holidays { holidays { id date name } }`);
  return data.holidays;
}

export async function fetchMe(): Promise<User | null> {
  const data = await request<{ me: User | null }>(`query Me { me { ${USER_FIELDS} } }`);
  return data.me;
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const data = await request<{ login: AuthPayload }>(
    `mutation Login($email: String!, $password: String!) {
      login(email: $email, password: $password) { token user { ${USER_FIELDS} } }
    }`,
    { email, password },
  );
  return data.login;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  agentCode?: string;
}): Promise<AuthPayload> {
  const data = await request<{ register: AuthPayload }>(
    `mutation Register($name: String!, $email: String!, $password: String!, $role: UserRole!, $agentCode: String) {
      register(name: $name, email: $email, password: $password, role: $role, agentCode: $agentCode) {
        token user { ${USER_FIELDS} }
      }
    }`,
    input as Record<string, unknown>,
  );
  return data.register;
}

export async function createTicket(input: {
  title: string;
  description: string;
  priority: Priority;
}): Promise<Ticket> {
  const data = await request<{ createTicket: Ticket }>(
    `mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
      createTicket(title: $title, description: $description, priority: $priority) { ${TICKET_FIELDS} }
    }`,
    input as Record<string, unknown>,
  );
  return data.createTicket;
}

export async function addComment(ticketId: string, content: string): Promise<Comment> {
  const data = await request<{ addComment: Comment }>(
    `mutation AddComment($ticketId: ID!, $content: String!) {
      addComment(ticketId: $ticketId, content: $content) {
        id content createdAt author { ${USER_FIELDS} }
      }
    }`,
    { ticketId, content },
  );
  return data.addComment;
}

export async function assignTicket(ticketId: string, assigneeId: string): Promise<Ticket> {
  const data = await request<{ assignTicket: Ticket }>(
    `mutation AssignTicket($ticketId: ID!, $assigneeId: ID!) {
      assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { ${TICKET_FIELDS} }
    }`,
    { ticketId, assigneeId },
  );
  return data.assignTicket;
}

export async function changeStatus(ticketId: string, status: TicketStatus): Promise<Ticket> {
  const data = await request<{ changeTicketStatus: Ticket }>(
    `mutation ChangeStatus($ticketId: ID!, $status: TicketStatus!) {
      changeTicketStatus(ticketId: $ticketId, status: $status) { ${TICKET_FIELDS} }
    }`,
    { ticketId, status },
  );
  return data.changeTicketStatus;
}

export async function resolveTicket(ticketId: string): Promise<Ticket> {
  const data = await request<{ resolveTicket: Ticket }>(
    `mutation ResolveTicket($ticketId: ID!) {
      resolveTicket(ticketId: $ticketId) { ${TICKET_FIELDS} }
    }`,
    { ticketId },
  );
  return data.resolveTicket;
}
