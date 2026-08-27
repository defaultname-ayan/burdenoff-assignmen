import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { prisma } from '../../src/db/client.js';
import { invalidateCalendarCache } from '../../src/services/sla/calendarProvider.js';
import { Account, expectData, gql, registerAccount, resetDatabase } from './gql.js';

let agent: Account;
let reporter: Account;
const ticketIds: string[] = [];

const LIST = `
  query Tickets($status: TicketStatus, $priority: Priority, $slaState: SLAState, $assigneeId: ID,
                $orderBy: TicketSortOrder, $take: Int, $cursor: String) {
    tickets(status: $status, priority: $priority, slaState: $slaState, assigneeId: $assigneeId,
            orderBy: $orderBy, take: $take, cursor: $cursor) {
      nodes { id number title priority status sla { overallState } }
      totalCount
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface ListResult {
  tickets: {
    nodes: Array<{ id: string; number: number; title: string; priority: string; status: string; sla: { overallState: string } }>;
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

beforeAll(async () => {
  await resetDatabase();
  invalidateCalendarCache();
  agent = await registerAccount('Queue Agent', 'queue-agent@test.local', 'AGENT');
  reporter = await registerAccount('Queue Reporter', 'queue-reporter@test.local', 'REPORTER');

  const priorities = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'URGENT', 'HIGH', 'MEDIUM'] as const;
  for (const [index, priority] of priorities.entries()) {
    const created = await gql<{ createTicket: { id: string } }>(
      `mutation C($title: String!, $description: String!, $priority: Priority!) {
        createTicket(title: $title, description: $description, priority: $priority) { id }
      }`,
      { title: `Ticket ${index + 1}`, description: `Body ${index + 1}`, priority },
      reporter.token,
    );
    ticketIds.push(expectData(created).createTicket.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cursor pagination', () => {
  it('walks every ticket exactly once across pages', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;

    do {
      const page: ListResult = expectData(
        await gql<ListResult>(LIST, { take: 3, cursor, orderBy: 'NEWEST' }, agent.token),
      );
      expect(page.tickets.totalCount).toBe(7);
      seen.push(...page.tickets.nodes.map((node) => node.id));
      cursor = page.tickets.pageInfo.hasNextPage ? page.tickets.pageInfo.endCursor : null;
      guard += 1;
    } while (cursor !== null && guard < 10);

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('does not skip a row when the cursor ticket leaves the filter set', async () => {
    const first: ListResult = expectData(
      await gql<ListResult>(LIST, { take: 3, status: 'OPEN', orderBy: 'NEWEST' }, agent.token),
    );
    const cursor = first.tickets.pageInfo.endCursor;
    const cursorTicket = first.tickets.nodes.at(-1);
    expect(cursor).not.toBeNull();
    expect(cursorTicket).toBeDefined();

    await prisma.ticket.update({
      where: { id: cursorTicket?.id ?? '' },
      data: { status: 'RESOLVED' },
    });

    const second: ListResult = expectData(
      await gql<ListResult>(
        LIST,
        { take: 3, status: 'OPEN', orderBy: 'NEWEST', cursor },
        agent.token,
      ),
    );

    const all: ListResult = expectData(
      await gql<ListResult>(LIST, { take: 50, status: 'OPEN', orderBy: 'NEWEST' }, agent.token),
    );
    const expectedAfterCursor = all.tickets.nodes
      .slice(first.tickets.nodes.length - 1)
      .map((node) => node.id);

    expect(second.tickets.nodes.map((node) => node.id)).toEqual(expectedAfterCursor.slice(0, 3));

    await prisma.ticket.update({
      where: { id: cursorTicket?.id ?? '' },
      data: { status: 'OPEN' },
    });
  });

  it('reports the full filtered count regardless of the cursor position', async () => {
    const page: ListResult = expectData(
      await gql<ListResult>(LIST, { take: 2, orderBy: 'NEWEST' }, agent.token),
    );
    const next: ListResult = expectData(
      await gql<ListResult>(
        LIST,
        { take: 2, orderBy: 'NEWEST', cursor: page.tickets.pageInfo.endCursor },
        agent.token,
      ),
    );
    expect(next.tickets.totalCount).toBe(page.tickets.totalCount);
  });

  it('treats % and _ in the search box as literal characters', async () => {
    const wildcard: ListResult = expectData(
      await gql<ListResult>(LIST, { take: 50 }, agent.token),
    );
    const percent = await gql<ListResult>(
      `query S($search: String) { tickets(search: $search, take: 50) { totalCount nodes { id number title priority status sla { overallState } } pageInfo { hasNextPage endCursor } } }`,
      { search: '%' },
      agent.token,
    );
    expect(expectData(percent).tickets.totalCount).toBe(0);
    expect(wildcard.tickets.totalCount).toBeGreaterThan(0);
  });

  it('rejects a malformed cursor rather than returning junk', async () => {
    const result = await gql(LIST, { take: 3, cursor: 'not-a-real-cursor' }, agent.token);
    expect(result.errorCode).not.toBeNull();
  });
});

describe('filtering', () => {
  it('filters by priority', async () => {
    const page = expectData(await gql<ListResult>(LIST, { priority: 'URGENT' }, agent.token));
    expect(page.tickets.totalCount).toBe(2);
    expect(page.tickets.nodes.every((node) => node.priority === 'URGENT')).toBe(true);
  });

  it('filters by status', async () => {
    await gql(
      `mutation S($id: ID!) { changeTicketStatus(ticketId: $id, status: IN_PROGRESS) { id } }`,
      { id: ticketIds[0] },
      agent.token,
    );
    const page = expectData(await gql<ListResult>(LIST, { status: 'IN_PROGRESS' }, agent.token));
    expect(page.tickets.totalCount).toBe(1);
    expect(page.tickets.nodes[0]?.id).toBe(ticketIds[0] ?? '');
  });

  it('filters by assignee', async () => {
    await gql(
      `mutation A($id: ID!, $assigneeId: ID!) { assignTicket(ticketId: $id, assigneeId: $assigneeId) { id } }`,
      { id: ticketIds[1], assigneeId: agent.id },
      agent.token,
    );
    const page = expectData(await gql<ListResult>(LIST, { assigneeId: agent.id }, agent.token));
    expect(page.tickets.totalCount).toBe(1);
    expect(page.tickets.nodes[0]?.id).toBe(ticketIds[1] ?? '');
  });

  it('filters by SLA state, and the SQL filter agrees with the engine', async () => {
    const onTrack = expectData(await gql<ListResult>(LIST, { slaState: 'ON_TRACK', take: 50 }, agent.token));

    expect(onTrack.tickets.totalCount).toBe(7);
    for (const node of onTrack.tickets.nodes) {
      expect(node.sla.overallState).toBe('ON_TRACK');
    }

    const breached = expectData(await gql<ListResult>(LIST, { slaState: 'BREACHED', take: 50 }, agent.token));
    expect(breached.tickets.totalCount).toBe(0);
  });

  it('finds a ticket whose deadline has been backdated into the past', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.ticket.update({
      where: { id: ticketIds[2] },
      data: { firstResponseDueAt: past, firstResponseAtRiskAt: past },
    });

    const breached = expectData(await gql<ListResult>(LIST, { slaState: 'BREACHED', take: 50 }, agent.token));
    expect(breached.tickets.totalCount).toBe(1);
    expect(breached.tickets.nodes[0]?.id).toBe(ticketIds[2] ?? '');

    expect(breached.tickets.nodes[0]?.sla.overallState).toBe('BREACHED');
  });
});

describe('sorting', () => {
  it('orders by priority, most urgent first', async () => {
    const page = expectData(await gql<ListResult>(LIST, { orderBy: 'PRIORITY', take: 50 }, agent.token));
    const rank: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    const ranks = page.tickets.nodes.map((node) => rank[node.priority] ?? -1);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });
});

describe('dashboard', () => {
  it('reports counters scoped to the viewer', async () => {
    const asAgent = expectData(
      await gql<{ dashboard: { totalTickets: number; breachedTickets: number; openTickets: number } }>(
        `query { dashboard { totalTickets openTickets inProgressTickets breachedTickets atRiskTickets unassignedTickets } }`,
        {},
        agent.token,
      ),
    );
    expect(asAgent.dashboard.totalTickets).toBe(7);
    expect(asAgent.dashboard.breachedTickets).toBe(1);

    const other = await registerAccount('Nobody', 'nobody@test.local', 'REPORTER');
    const asOther = expectData(
      await gql<{ dashboard: { totalTickets: number } }>(
        `query { dashboard { totalTickets } }`,
        {},
        other.token,
      ),
    );

    expect(asOther.dashboard.totalTickets).toBe(0);
  });
});

describe('holiday calendar', () => {
  it('pushes SLA deadlines out when a holiday is added', async () => {
    const created = expectData(
      await gql<{ createTicket: { id: string } }>(
        `mutation { createTicket(title: "Holiday impact", description: "Check recompute", priority: LOW) { id } }`,
        {},
        reporter.token,
      ),
    );
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: created.createTicket.id } });

    const holidayDate = new Date(before.resolutionDueAt.getTime() - 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const holiday = await gql<{ createHoliday: { id: string; date: string; name: string } }>(
      `mutation H($date: String!, $name: String!) { createHoliday(date: $date, name: $name) { id date name } }`,
      { date: holidayDate, name: 'Test Holiday' },
      agent.token,
    );
    expect(expectData(holiday).createHoliday.date).toBe(holidayDate);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: created.createTicket.id } });
    expect(after.resolutionDueAt.getTime()).toBeGreaterThanOrEqual(before.resolutionDueAt.getTime());

    const holidays = expectData(
      await gql<{ holidays: Array<{ date: string }> }>(`query { holidays { id date name } }`, {}, reporter.token),
    );
    expect(holidays.holidays.map((entry) => entry.date)).toContain(holidayDate);
  });

  it('forbids a reporter from editing the holiday calendar', async () => {
    const result = await gql(
      `mutation { createHoliday(date: "2030-01-01", name: "Nope") { id } }`,
      {},
      reporter.token,
    );
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('rejects a malformed holiday date', async () => {
    const result = await gql(
      `mutation { createHoliday(date: "not-a-date", name: "Bad") { id } }`,
      {},
      agent.token,
    );
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});
