import { PrismaClient, type Priority } from '@prisma/client';
import { DateTime } from 'luxon';
import { hashPassword } from '../src/auth/password.js';
import {
  createCalendar,
  isWorkingDay,
  type BusinessCalendar,
} from '../src/services/sla/businessHours.js';
import { computeTargets } from '../src/services/sla/slaEngine.js';
import { config } from '../src/config/index.js';

const prisma = new PrismaClient();

const PASSWORD = 'password123';

interface TicketSeed {
  title: string;
  description: string;
  priority: Priority;
  agedBusinessHours: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assign: boolean;
  reporterComment: string;
  agentReply: string | null;
}

const TICKETS: TicketSeed[] = [
  {
    title: 'Payment failed at checkout',
    description: 'Customers on the Pro plan see "card declined" even with a valid card.',
    priority: 'URGENT',
    agedBusinessHours: 6,
    status: 'IN_PROGRESS',
    assign: true,
    reporterComment: 'Three customers have reported this in the last ten minutes.',
    agentReply: null,
  },
  {
    title: 'Cannot log in with SSO',
    description: 'SAML login redirects back to the login page without an error message.',
    priority: 'HIGH',
    agedBusinessHours: 3.5,
    status: 'OPEN',
    assign: false,
    reporterComment: 'Started this morning, affects the whole marketing team.',
    agentReply: null,
  },
  {
    title: 'Export to CSV drops the last row',
    description: 'Exporting a report of N rows produces a file with N-1 rows.',
    priority: 'MEDIUM',
    agedBusinessHours: 2,
    status: 'IN_PROGRESS',
    assign: true,
    reporterComment: 'Reproducible on any report with more than one row.',
    agentReply: 'Thanks - reproduced it, the off-by-one is in the pagination cursor.',
  },
  {
    title: 'Dashboard chart labels overlap on mobile',
    description: 'On screens narrower than 380px the x-axis labels overlap.',
    priority: 'LOW',
    agedBusinessHours: 1,
    status: 'RESOLVED',
    assign: true,
    reporterComment: 'Minor, but it looks broken on my phone.',
    agentReply: 'Fixed by rotating the labels - shipping in this week release.',
  },
];

function businessHoursAgo(from: Date, hours: number, calendar: BusinessCalendar): Date {
  let remaining = hours * 60;
  let cursor = DateTime.fromJSDate(from, { zone: config.businessTimezone });

  for (let guard = 0; guard < 400 && remaining > 0; guard += 1) {
    const dayOpen = cursor.startOf('day').set({ hour: config.businessStartHour });
    const dayClose = cursor.startOf('day').set({ hour: config.businessEndHour });
    const isWorking = isWorkingDay(cursor, calendar);

    if (!isWorking || cursor <= dayOpen) {
      cursor = cursor.minus({ days: 1 }).startOf('day').set({ hour: config.businessEndHour });
      continue;
    }
    if (cursor > dayClose) {
      cursor = dayClose;
      continue;
    }

    const usable = Math.min(remaining, cursor.diff(dayOpen, 'minutes').minutes);
    cursor = cursor.minus({ minutes: usable });
    remaining -= usable;
    if (remaining > 0) {
      cursor = cursor.minus({ days: 1 }).startOf('day').set({ hour: config.businessEndHour });
    }
  }
  return cursor.toJSDate();
}

async function main(): Promise<void> {
  console.log('Seeding...');
  await prisma.ticketEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.user.deleteMany();
  await prisma.holiday.deleteMany();

  const passwordHash = await hashPassword(PASSWORD);

  const [agent, secondAgent, reporter, secondReporter] = await Promise.all([
    prisma.user.create({
      data: { name: 'Asha Menon', email: 'agent@example.com', passwordHash, role: 'AGENT' },
    }),
    prisma.user.create({
      data: { name: 'Ravi Kumar', email: 'agent2@example.com', passwordHash, role: 'AGENT' },
    }),
    prisma.user.create({
      data: { name: 'Priya Nair', email: 'reporter@example.com', passwordHash, role: 'REPORTER' },
    }),
    prisma.user.create({
      data: { name: 'Sam Fernandes', email: 'reporter2@example.com', passwordHash, role: 'REPORTER' },
    }),
  ]);

  const holidays = [
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-12-25', name: 'Christmas Day' },
  ];
  await prisma.holiday.createMany({
    data: holidays.map((holiday) => ({
      date: DateTime.fromISO(holiday.date, { zone: 'utc' }).toJSDate(),
      name: holiday.name,
    })),
  });

  const calendar = createCalendar({
    timeZone: config.businessTimezone,
    startHour: config.businessStartHour,
    endHour: config.businessEndHour,
    holidays: holidays.map((holiday) => holiday.date),
  });

  const now = new Date();

  for (const [index, seed] of TICKETS.entries()) {
    const createdAt = businessHoursAgo(now, seed.agedBusinessHours, calendar);
    const targets = computeTargets(seed.priority, createdAt, calendar);
    const ticketReporter = index % 2 === 0 ? reporter : secondReporter;

    const ticket = await prisma.ticket.create({
      data: {
        title: seed.title,
        description: seed.description,
        priority: seed.priority,
        status: seed.status,
        reporterId: ticketReporter.id,
        assigneeId: seed.assign ? (index % 2 === 0 ? agent.id : secondAgent.id) : null,
        createdAt,
        slaStartedAt: createdAt,
        ...targets,
      },
    });

    await prisma.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: ticketReporter.id,
        content: seed.reporterComment,
        createdAt: new Date(createdAt.getTime() + 60_000),
      },
    });

    if (seed.agentReply !== null) {
      const repliedAt = new Date(createdAt.getTime() + 15 * 60_000);
      await prisma.comment.create({
        data: { ticketId: ticket.id, authorId: agent.id, content: seed.agentReply, createdAt: repliedAt },
      });
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          firstResponseAt: repliedAt,
          ...(seed.status === 'RESOLVED'
            ? { resolvedAt: new Date(createdAt.getTime() + 40 * 60_000) }
            : {}),
        },
      });
    }
  }

  console.log(`Seeded ${TICKETS.length} tickets, 4 users and ${holidays.length} holidays.`);
  console.log(`Login with agent@example.com / reporter@example.com - password: ${PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
