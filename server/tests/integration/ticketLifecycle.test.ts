import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { prisma } from '../../src/db/client.js';
import { invalidateCalendarCache } from '../../src/services/sla/calendarProvider.js';
import { Account, expectData, gql, registerAccount, resetDatabase } from './gql.js';

let agent: Account;
let secondAgent: Account;
let reporter: Account;
let outsider: Account;

const CREATE_TICKET = `
  mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
    createTicket(title: $title, description: $description, priority: $priority) {
      id number title status priority
      reporter { id email }
      sla {
        overallState
        firstResponse { dueAt state remainingMinutes completed budgetMinutes }
        resolution { dueAt state completed }
      }
    }
  }`;

interface CreatedTicket {
  createTicket: {
    id: string;
    number: number;
    title: string;
    status: string;
    priority: string;
    reporter: { id: string; email: string };
    sla: {
      overallState: string;
      firstResponse: {
        dueAt: string;
        state: string;
        remainingMinutes: number;
        completed: boolean;
        budgetMinutes: number;
      };
      resolution: { dueAt: string; state: string; completed: boolean };
    };
  };
}

async function createTicket(
  token: string,
  overrides: Partial<{ title: string; description: string; priority: string }> = {},
): Promise<CreatedTicket['createTicket']> {
  const result = await gql<CreatedTicket>(
    CREATE_TICKET,
    {
      title: overrides.title ?? 'Payment failed at checkout',
      description: overrides.description ?? 'Cards are declined for every Pro customer.',
      priority: overrides.priority ?? 'HIGH',
    },
    token,
  );
  return expectData(result).createTicket;
}

async function comment(token: string, ticketId: string, content: string): Promise<string> {
  const result = await gql<{ addComment: { id: string; createdAt: string } }>(
    `mutation AddComment($ticketId: ID!, $content: String!) {
      addComment(ticketId: $ticketId, content: $content) { id createdAt author { id } }
    }`,
    { ticketId, content },
    token,
  );
  return expectData(result).addComment.createdAt;
}

beforeAll(async () => {
  await resetDatabase();
  invalidateCalendarCache();
  agent = await registerAccount('Asha Menon', 'agent@test.local', 'AGENT');
  secondAgent = await registerAccount('Ravi Kumar', 'agent2@test.local', 'AGENT');
  reporter = await registerAccount('Priya Nair', 'reporter@test.local', 'REPORTER');
  outsider = await registerAccount('Sam Fernandes', 'outsider@test.local', 'REPORTER');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('authentication', () => {
  it('rejects anonymous ticket creation', async () => {
    const result = await gql(CREATE_TICKET, {
      title: 'x',
      description: 'y',
      priority: 'LOW',
    });
    expect(result.errorCode).toBe('UNAUTHENTICATED');
  });

  it('refuses to mint an agent without the signup code', async () => {
    const result = await gql(
      `mutation { register(name: "Mallory", email: "mallory@test.local", password: "password123", role: AGENT) { token } }`,
    );
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('never stores the password in plain text', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@test.local' } });
    expect(user.passwordHash).not.toContain('password123');
    expect(user.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('rejects a wrong password without revealing which part was wrong', async () => {
    const result = await gql(
      `mutation { login(email: "agent@test.local", password: "wrong-password") { token } }`,
    );
    expect(result.errorCode).toBe('UNAUTHORIZED');
    expect(result.errorMessage).toBe('Invalid email or password.');
  });
});

describe('ticket creation and validation', () => {
  it('persists a ticket with SLA targets computed by the engine', async () => {
    const ticket = await createTicket(reporter.token);

    expect(ticket.status).toBe('OPEN');
    expect(ticket.number).toBeGreaterThan(0);
    expect(ticket.reporter.email).toBe('reporter@test.local');
    expect(ticket.sla.firstResponse.budgetMinutes).toBe(240);
    expect(ticket.sla.firstResponse.completed).toBe(false);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.firstResponseAt).toBeNull();
    expect(row.resolvedAt).toBeNull();
    expect(row.firstResponseDueAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
    expect(row.resolutionDueAt.getTime()).toBeGreaterThan(row.firstResponseDueAt.getTime());
    expect(row.firstResponseAtRiskAt.getTime()).toBeLessThan(row.firstResponseDueAt.getTime());
    expect(new Date(ticket.sla.firstResponse.dueAt).toISOString()).toBe(
      row.firstResponseDueAt.toISOString(),
    );
  });

  it('rejects an empty title', async () => {
    const result = await gql(CREATE_TICKET, { title: '   ', description: 'body', priority: 'LOW' }, reporter.token);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty description', async () => {
    const result = await gql(CREATE_TICKET, { title: 'title', description: '', priority: 'LOW' }, reporter.token);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid priority at the schema boundary', async () => {
    const result = await gql(CREATE_TICKET, { title: 'title', description: 'body', priority: 'CRITICAL' }, reporter.token);
    expect(result.errorCode).toBe('BAD_USER_INPUT');
  });

  it('returns TICKET_NOT_FOUND for a ticket that does not exist', async () => {
    const result = await gql(
      `mutation Assign($id: ID!) { assignTicket(ticketId: $id, assigneeId: $id) { id } }`,
      { id: '00000000-0000-0000-0000-000000000000' },
      agent.token,
    );
    expect(result.errorCode).toBe('TICKET_NOT_FOUND');
  });
});

describe('first response recording', () => {
  it('records firstResponseAt on the first non-reporter comment and never again', async () => {
    const ticket = await createTicket(reporter.token, { title: 'SSO login loop' });

    await comment(reporter.token, ticket.id, 'Adding more detail.');
    await comment(reporter.token, ticket.id, 'Still broken.');
    let row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.firstResponseAt).toBeNull();

    const agentRepliedAt = await comment(agent.token, ticket.id, 'Looking into it now.');
    row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.firstResponseAt).not.toBeNull();
    expect(row.firstResponseAt?.toISOString()).toBe(new Date(agentRepliedAt).toISOString());

    const frozen = row.firstResponseAt;
    await comment(secondAgent.token, ticket.id, 'Taking over.');
    await comment(reporter.token, ticket.id, 'Thanks!');
    row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.firstResponseAt?.toISOString()).toBe(frozen?.toISOString() ?? '');

    const view = await gql<{ ticket: { sla: { firstResponse: { state: string; completed: boolean } } ; comments: unknown[] } }>(
      `query T($id: ID!) {
        ticket(id: $id) {
          firstResponseAt
          comments { id }
          sla { firstResponse { state completed completedAt } }
        }
      }`,
      { id: ticket.id },
      agent.token,
    );
    const data = expectData(view);
    expect(data.ticket.sla.firstResponse.completed).toBe(true);
    expect(data.ticket.sla.firstResponse.state).toBe('MET');

    expect(data.ticket.comments).toHaveLength(5);
  });

  it('rejects an empty comment with INVALID_COMMENT', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Empty comment check' });
    const result = await gql(
      `mutation C($id: ID!) { addComment(ticketId: $id, content: "   ") { id } }`,
      { id: ticket.id },
      reporter.token,
    );
    expect(result.errorCode).toBe('INVALID_COMMENT');
  });
});

describe('assignment and authorization', () => {
  it('lets an agent assign a ticket and records an audit event', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Assignment check' });
    const result = await gql<{ assignTicket: { assignee: { id: string; name: string } } }>(
      `mutation A($ticketId: ID!, $assigneeId: ID!) {
        assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { assignee { id name } }
      }`,
      { ticketId: ticket.id, assigneeId: agent.id },
      agent.token,
    );
    expect(expectData(result).assignTicket.assignee.id).toBe(agent.id);

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: ticket.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('ASSIGNEE_CHANGED');
    expect(events[0]?.toValue).toBe(agent.id);
  });

  it('forbids a reporter from assigning a ticket', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Reporter assign attempt' });
    const result = await gql(
      `mutation A($ticketId: ID!, $assigneeId: ID!) { assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { id } }`,
      { ticketId: ticket.id, assigneeId: agent.id },
      reporter.token,
    );
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('rejects a non-existent assignee with USER_NOT_FOUND', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Missing assignee' });
    const result = await gql(
      `mutation A($ticketId: ID!, $assigneeId: ID!) { assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { id } }`,
      { ticketId: ticket.id, assigneeId: '00000000-0000-0000-0000-000000000000' },
      agent.token,
    );
    expect(result.errorCode).toBe('USER_NOT_FOUND');
  });

  it('refuses to assign a ticket to a reporter', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Assign to reporter' });
    const result = await gql(
      `mutation A($ticketId: ID!, $assigneeId: ID!) { assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { id } }`,
      { ticketId: ticket.id, assigneeId: reporter.id },
      agent.token,
    );
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('hides other reporters tickets', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Private to the reporter' });
    const result = await gql<{ ticket: unknown | null }>(
      `query T($id: ID!) { ticket(id: $id) { id } }`,
      { id: ticket.id },
      outsider.token,
    );
    expect(expectData(result).ticket).toBeNull();

    const asAgent = await gql<{ ticket: { id: string } | null }>(
      `query T($id: ID!) { ticket(id: $id) { id } }`,
      { id: ticket.id },
      agent.token,
    );
    expect(expectData(asAgent).ticket?.id).toBe(ticket.id);
  });

  it('keeps the user directory agent-only', async () => {
    const result = await gql(`query { users(role: AGENT) { id } }`, {}, reporter.token);
    expect(result.errorCode).toBe('FORBIDDEN');
  });
});

describe('status transitions', () => {
  const CHANGE = `mutation S($ticketId: ID!, $status: TicketStatus!) {
    changeTicketStatus(ticketId: $ticketId, status: $status) { status resolvedAt }
  }`;

  it('walks the happy path and freezes the resolution clock', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Lifecycle', priority: 'URGENT' });

    const inProgress = await gql<{ changeTicketStatus: { status: string } }>(
      CHANGE,
      { ticketId: ticket.id, status: 'IN_PROGRESS' },
      agent.token,
    );
    expect(expectData(inProgress).changeTicketStatus.status).toBe('IN_PROGRESS');

    const resolved = await gql<{ resolveTicket: { status: string; resolvedAt: string | null } }>(
      `mutation R($id: ID!) { resolveTicket(ticketId: $id) { status resolvedAt sla { resolution { state completed } } } }`,
      { id: ticket.id },
      agent.token,
    );
    const resolvedTicket = expectData(resolved).resolveTicket;
    expect(resolvedTicket.status).toBe('RESOLVED');
    expect(resolvedTicket.resolvedAt).not.toBeNull();

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.resolvedAt).not.toBeNull();

    const closed = await gql<{ changeTicketStatus: { status: string } }>(
      CHANGE,
      { ticketId: ticket.id, status: 'CLOSED' },
      agent.token,
    );
    expect(expectData(closed).changeTicketStatus.status).toBe('CLOSED');
  });

  it('rejects CLOSED -> IN_PROGRESS with INVALID_STATUS_TRANSITION', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Closed ticket' });
    await gql(CHANGE, { ticketId: ticket.id, status: 'RESOLVED' }, agent.token);
    await gql(CHANGE, { ticketId: ticket.id, status: 'CLOSED' }, agent.token);

    const result = await gql(CHANGE, { ticketId: ticket.id, status: 'IN_PROGRESS' }, agent.token);
    expect(result.errorCode).toBe('INVALID_STATUS_TRANSITION');
    expect(result.errorMessage).toBe('Ticket cannot transition from CLOSED to IN_PROGRESS.');
  });

  it('restarts the resolution clock when a closed ticket is reopened', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Reopen me', priority: 'URGENT' });
    await gql(CHANGE, { ticketId: ticket.id, status: 'RESOLVED' }, agent.token);
    await gql(CHANGE, { ticketId: ticket.id, status: 'CLOSED' }, agent.token);

    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    await gql(CHANGE, { ticketId: ticket.id, status: 'OPEN' }, agent.token);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });

    expect(after.status).toBe('OPEN');
    expect(after.resolvedAt).toBeNull();
    expect(after.resolutionDueAt.getTime()).toBeGreaterThan(before.resolutionDueAt.getTime());

    expect(after.firstResponseDueAt.toISOString()).toBe(before.firstResponseDueAt.toISOString());
  });

  it('stops the resolution clock when a ticket is closed without being resolved', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Closed without resolving' });

    const closed = await gql<{ changeTicketStatus: { status: string; resolvedAt: string | null } }>(
      CHANGE,
      { ticketId: ticket.id, status: 'CLOSED' },
      agent.token,
    );
    expect(expectData(closed).changeTicketStatus.status).toBe('CLOSED');

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.resolvedAt).not.toBeNull();

    const view = await gql<{ ticket: { sla: { resolution: { completed: boolean; state: string } } } }>(
      `query T($id: ID!) { ticket(id: $id) { sla { resolution { completed state } } } }`,
      { id: ticket.id },
      agent.token,
    );
    const resolution = expectData(view).ticket.sla.resolution;
    expect(resolution.completed).toBe(true);
    expect(resolution.state).toBe('MET');
  });

  it('forbids a reporter from changing status', async () => {
    const ticket = await createTicket(reporter.token, { title: 'Reporter status attempt' });
    const result = await gql(CHANGE, { ticketId: ticket.id, status: 'RESOLVED' }, reporter.token);
    expect(result.errorCode).toBe('FORBIDDEN');
  });
});
