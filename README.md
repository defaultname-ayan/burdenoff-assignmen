# Support Ticket & SLA Tracker

A support desk where users raise tickets, agents work them, and every ticket carries
**SLA deadlines measured in business hours** — nights, weekends and configured public
holidays never count against a clock.

Bun · TypeScript (strict, no `any`) · GraphQL Yoga (schema-first) · Prisma · PostgreSQL · React

---

## Contents

- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [The SLA engine](#the-sla-engine)
- [Status transition rules](#status-transition-rules)
- [Authentication & authorization](#authentication--authorization)
- [Error codes](#error-codes)
- [Environment variables](#environment-variables)
- [Running tests](#running-tests)
- [Example GraphQL operations](#example-graphql-operations)
- [Tradeoffs & known limitations](#tradeoffs--known-limitations)
- [How I'd extend this](#how-id-extend-this)

---

## Quick start

Prerequisites: [Bun](https://bun.sh) ≥ 1.1 and Docker.

```bash
# 1. Postgres (dev on :5433, an isolated test database on :5434)
docker compose up -d

# 2. Dependencies for both packages
bun run setup            # == bun install in ./server and ./web

# 3. Environment
cp server/.env.example server/.env
cp web/.env.example web/.env      # optional; defaults to http://localhost:4000/graphql

# 4. Migrate + generate the client + seed demo data
bun run gendb

# 5. Run backend (:4000) and frontend (:5173) together
bun run dev
```

Backend and frontend are separate processes. To run them individually:

```bash
bun run dev:server   # GraphQL API at http://localhost:4000/graphql
bun run dev:web      # UI at http://localhost:5173
```

**Seeded logins** (password `password123` for all):

| Email                   | Role     |
| ----------------------- | -------- |
| `agent@example.com`     | AGENT    |
| `agent2@example.com`    | AGENT    |
| `reporter@example.com`  | REPORTER |
| `reporter2@example.com` | REPORTER |

The seed backdates its four tickets by different amounts of *business* time so the
dashboard shows a breached, an at-risk, an on-track and a met ticket immediately.

### Database commands

```bash
cd server
bun run migrate          # prisma migrate dev  — create a new migration
bun run migrate:deploy   # prisma migrate deploy — apply committed migrations
bun run prisma:generate  # regenerate the Prisma client
bun run seed             # reseed (destructive: truncates and re-inserts)
```

Migrations live in `server/prisma/migrations/` and are committed. The schema is only
ever changed through `prisma migrate dev` — never by hand-editing the database.

---

## Tech stack

| Layer      | Choice                                        | Why                                                                   |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------- |
| Runtime    | Bun                                           | Native TypeScript, built-in test runner, built-in argon2id hashing     |
| API        | GraphQL Yoga, schema-first `.graphql` + TS resolvers | Required; keeps the contract readable and reviewable in isolation |
| ORM        | Prisma                                        | Typed queries, first-class migrations                                  |
| Database   | PostgreSQL 16 (Docker Compose)                | Required                                                               |
| Time math  | Luxon                                         | Correct IANA-timezone arithmetic; hand-rolling DST/offset math is a bug factory |
| Auth       | `jose` (HS256 JWT) + `Bun.password` (argon2id) | No native build step, no third-party crypto in the security path       |
| Frontend   | React 18 + Vite + React Router                | Small, no state-library ceremony for a UI this size                    |
| UI         | Tailwind CSS v4 + shadcn/ui design system     | Local copy-and-own primitives; tokens, radii and focus rings from one source |

---

## Architecture

Business logic lives in services. Resolvers are a thin translation layer: they take
arguments, call a service, and map domain objects to the GraphQL shape. **No SLA
arithmetic exists inside a resolver.**

```
server/
  prisma/
    schema.prisma            # models, relations, indexes
    migrations/              # committed prisma migrate dev output
    seed.ts
  src/
    config/                  # env parsing + validation (fails fast at boot)
    errors/                  # AppError + machine-readable ErrorCode registry
    validation/              # server-side input validation, one place
    auth/
      password.ts            # argon2id hash/verify
      jwt.ts                 # sign/verify
      context.ts             # request -> GraphQLContext, requireViewer/requireAgent
    db/
      client.ts              # PrismaClient singleton
      userLoader.ts          # per-request batching loader (kills the list N+1)
    services/
      sla/
        businessHours.ts     # ← pure business-hours arithmetic. No DB, no clock.
        policies.ts          # priority -> budget table (env-overridable)
        slaEngine.ts         # ← targets, clock states, freezing
        calendarProvider.ts  # holidays -> BusinessCalendar (cached)
      ticket/
        transitions.ts       # the status state machine
        ticketService.ts     # create/assign/status/resolve/comment + listing
        ticketFilters.ts     # SLA state translated into SQL
      auth/authService.ts
      holiday/holidayService.ts
      dashboard/dashboardService.ts
    graphql/
      schema/*.graphql       # the SDL
      resolvers/*.ts         # thin; delegate to services
      schema.ts              # loads SDL from disk, makeExecutableSchema
    server.ts                # Yoga + error masking
  tests/
    unit/                    # SLA engine, transitions, validation (no DB)
    integration/             # full stack against real PostgreSQL
web/
  src/
    api/                     # typed GraphQL client + operations
    components/  pages/      # UI
```

### Request flow

```
HTTP → Yoga → buildContext (verify JWT, load user, create loaders)
            → resolver (arguments only)
            → service (authorization, validation, business rules)
            → Prisma → PostgreSQL
            ← domain object
            ← field resolvers (SLA computed on read, timestamps → ISO-8601)
```

---

## Database schema

| Model         | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `User`        | `REPORTER` or `AGENT`; unique email; argon2id `passwordHash`            |
| `Ticket`      | title, description, priority, status, reporter, optional assignee, timestamps, **persisted SLA targets** |
| `Comment`     | belongs to a ticket, records its author, cascades on ticket delete       |
| `Holiday`     | unique `DATE` + name; excluded from business-hour maths                  |
| `TicketEvent` | audit trail for status and assignee changes (bonus)                      |

Ticket SLA columns:

| Column                  | Meaning                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `slaStartedAt`          | when the resolution clock started (creation, or the last reopen) |
| `firstResponseDueAt`    | first-response deadline, in business hours                      |
| `firstResponseAtRiskAt` | instant at which 75% of the first-response budget is consumed   |
| `resolutionDueAt`       | resolution deadline                                             |
| `resolutionAtRiskAt`    | instant at which 75% of the resolution budget is consumed       |
| `firstResponseAt`       | actual first response — **freezes** that clock                  |
| `resolvedAt`            | actual resolution — **freezes** that clock                      |

**Why store the targets instead of computing them on every read?** Because SLA state
then reduces to plain timestamp comparisons, which means it can be expressed *in SQL*.
Filtering by `slaState` and counting the dashboard's at-risk/breached tiles happen in
Postgres, so `tickets(slaState: BREACHED)` still paginates correctly. `ticketFilters.ts`
is a line-by-line SQL mirror of `evaluateClock` in the engine, and an integration test
asserts the two agree.

Indexes: `status`, `priority`, `assigneeId`, `reporterId`, `(createdAt, id)` for the
pagination ordering, plus `(resolvedAt, resolutionDueAt)` and
`(firstResponseAt, firstResponseDueAt)` for the SLA-state filters.

---

## The SLA engine

`src/services/sla/businessHours.ts` is pure: no database, no `Date.now()`, no config
import. Everything it needs arrives as arguments, which is what makes it exhaustively
unit-testable.

### Policies (defaults)

| Priority | First response      | Resolution           |
| -------- | ------------------- | -------------------- |
| URGENT   | 1 business hour     | 4 business hours     |
| HIGH     | 4 business hours    | 24 business hours    |
| MEDIUM   | 8 business hours    | 48 business hours    |
| LOW      | 24 business hours   | 72 business hours    |

Overridable with a `SLA_POLICIES` JSON env var, e.g.
`SLA_POLICIES='{"URGENT":{"firstResponseMinutes":30,"resolutionMinutes":120}}'`.

### Business hours

Monday–Friday, `BUSINESS_START_HOUR`–`BUSINESS_END_HOUR` (default 09:00–18:00) in
`BUSINESS_TIMEZONE` (default `Asia/Kolkata`) — **9 business hours per working day**.
Weekends and rows in the `Holiday` table contribute zero.

### How a deadline is computed

`addBusinessMinutes(from, minutes, calendar)`:

1. Pull `from` forward onto the business clock (`nextBusinessInstant`). A ticket raised
   at 03:00 starts burning budget at 09:00; one raised at 20:00 starts at 09:00 the next
   working day; one raised on Saturday starts Monday.
2. Consume the remainder of the current day's window; if budget is left, jump to the next
   working day's opening bell and repeat, skipping weekends and holidays.

The worked example from the brief, which is a test:

```
HIGH ticket created Friday 17:00, first-response budget = 4 business hours
  Friday 17:00 → 18:00     1h
  Saturday, Sunday          0
  Monday 09:00 → 12:00      3h
⇒ first response due Monday 12:00
```

With Monday configured as a holiday the same ticket is due **Tuesday 12:00**.

### SLA state

Each clock is one of `ON_TRACK`, `AT_RISK`, `BREACHED` or `MET`:

| State      | Rule                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| `ON_TRACK` | 0–75% of the business-hour budget consumed, event outstanding           |
| `AT_RISK`  | **strictly more than** 75% consumed, deadline not yet passed            |
| `BREACHED` | deadline passed with the event outstanding, *or* the event happened late |
| `MET`      | the event happened on or before the deadline                            |

**75% boundary:** at *exactly* 75% consumed a clock is still `ON_TRACK`. `AT_RISK`
requires strictly more, so a HIGH ticket with a 4-hour first-response budget flips at
3h00m*+1 minute*, not at 3h00m. `MET` is an addition to the three states named in the
brief: without it a completed clock would have to keep reporting `ON_TRACK` forever,
which reads as "still running". The brief's own UI mock shows a `🟢 Met` badge, and
`MET` is filterable like any other state.

### Clock freezing

Once an event happens, its clock stops **permanently**:

- The first comment by anyone other than the reporter sets `firstResponseAt`. It is
  written with an atomic `updateMany … where firstResponseAt IS NULL` compare-and-set, so
  concurrent replies cannot both win, and later comments never move it.
- Entering `RESOLVED` sets `resolvedAt`.

A frozen clock is judged once, at its event timestamp, and never re-evaluated. A first
response delivered inside budget stays `MET` forever, even if the ticket then sits open
for a fortnight (an explicit unit test). A late one stays `BREACHED` with a *fixed*
overdue figure that does not keep growing.

### Remaining time

`remainingMinutes` is remaining **business** minutes and may be **negative** — that is
minutes overdue. Frozen clocks report the frozen figure. The frontend renders these
numbers verbatim; it never decides breach or at-risk state itself.

### Timezones

- Every timestamp is stored in UTC and leaves the API as ISO-8601 (`…Z`).
- Business hours are interpreted in `BUSINESS_TIMEZONE`.
- The frontend renders timestamps with `toLocaleString()` — the viewer's own timezone.

### Holidays

Holidays are a database table, editable by agents via `createHoliday` / `deleteHoliday`,
and stored as a `DATE` at midnight UTC so a calendar date is never shifted by a server
offset. Adding or removing one **recomputes the persisted SLA targets of every ticket
still in flight** (clocks that have already stopped are left alone — history is not
rewritten). The calendar is cached in-process for 60s and invalidated on every edit.

---

## Status transition rules

```
        ┌──────────────► CLOSED ──────┐
        │                  ▲          │ (reopen)
        │                  │          ▼
     OPEN ◄────────► IN_PROGRESS ► RESOLVED
        ▲                              │
        └──────────── (reopen) ────────┘
```

| From          | May become                       |
| ------------- | -------------------------------- |
| `OPEN`        | `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `IN_PROGRESS` | `OPEN`, `RESOLVED`, `CLOSED`     |
| `RESOLVED`    | `CLOSED`, `OPEN` *(reopen)*      |
| `CLOSED`      | `OPEN` *(reopen only)*           |

- `CLOSED → IN_PROGRESS` is rejected: a closed ticket must be explicitly reopened first.
- A transition to the status a ticket already has is rejected.
- **Reopening** (`RESOLVED`/`CLOSED` → `OPEN`) clears `resolvedAt` and restarts the
  *resolution* budget from the reopen instant. Without this a reopened ticket would be
  permanently breached the moment it came back. The first-response clock is deliberately
  untouched — that event genuinely happened.
- A closed ticket also rejects new comments and reassignment until reopened.

Rejections return `INVALID_STATUS_TRANSITION` with the message
`Ticket cannot transition from CLOSED to IN_PROGRESS.` and `extensions.details = { from, to }`.

---

## Authentication & authorization

- **Passwords** are hashed with **argon2id** (`Bun.password`, 19 MiB / t=2). Plain text
  is never stored — asserted by an integration test that reads the row back.
- **Sessions** are stateless HS256 JWTs (`Authorization: Bearer …`). The user row is
  re-read on every request, so a deleted account or a changed role takes effect at once
  rather than at token expiry.
- **Agent registration is gated**: registering with `role: AGENT` requires the shared
  `AGENT_SIGNUP_CODE`. Anyone may register as a `REPORTER`.

Every rule is enforced server-side, in the services, never in the UI:

| Action                                  | REPORTER              | AGENT |
| --------------------------------------- | --------------------- | ----- |
| Create a ticket                         | ✅                     | ✅     |
| Comment                                 | ✅ *(own tickets)*     | ✅     |
| View tickets                            | ✅ *own tickets only*  | ✅ all |
| Assign / change status / resolve        | ❌ `FORBIDDEN`         | ✅     |
| List users, edit the holiday calendar   | ❌ `FORBIDDEN`         | ✅     |

A reporter requesting someone else's ticket gets **`null` / `TICKET_NOT_FOUND`**, not
`FORBIDDEN` — a "forbidden" would confirm the ticket exists.

---

## Error codes

Deliberate business errors carry a machine-readable `extensions.code` (plus `field` for
validation failures). Parse, validation and enum-coercion failures raised by GraphQL
itself keep their own code too. Only genuine crashes are logged server-side and masked as
`INTERNAL_SERVER_ERROR`, so stack traces and SQL never reach a client.

| Code                        | Raised when                                            |
| --------------------------- | ------------------------------------------------------ |
| `VALIDATION_ERROR`          | empty/oversized field, bad email, weak password, bad date |
| `BAD_USER_INPUT`            | malformed query or an out-of-enum value, caught by GraphQL itself |
| `INVALID_PRIORITY`          | priority outside the enum                              |
| `INVALID_COMMENT`           | empty comment body                                     |
| `TICKET_NOT_FOUND`          | no such ticket, or not visible to the viewer           |
| `USER_NOT_FOUND`            | no such assignee                                       |
| `UNAUTHENTICATED`           | missing or invalid token                               |
| `UNAUTHORIZED`              | bad login credentials                                  |
| `FORBIDDEN`                 | authenticated but not allowed                          |
| `INVALID_STATUS_TRANSITION` | transition not permitted by the state machine          |
| `INVALID_CURSOR`            | malformed pagination cursor                            |
| `CONFLICT`                  | reserved for concurrency conflicts                     |

The UI shows the code alongside the message, so validation and authorization failures are
always visible rather than silently swallowed.

---

## Environment variables

`server/.env` (copy from `server/.env.example`; real secrets are **not** committed):

| Variable              | Default             | Notes                                             |
| --------------------- | ------------------- | ------------------------------------------------- |
| `DATABASE_URL`        | —                   | required                                          |
| `JWT_SECRET`          | —                   | required; use a long random string                |
| `JWT_EXPIRES_IN`      | `7d`                |                                                   |
| `AGENT_SIGNUP_CODE`   | *(empty)*           | empty disables agent self-registration entirely   |
| `BUSINESS_TIMEZONE`   | `Asia/Kolkata`      | any IANA zone; validated at boot                  |
| `BUSINESS_START_HOUR` | `9`                 |                                                   |
| `BUSINESS_END_HOUR`   | `18`                |                                                   |
| `SLA_POLICIES`        | *(built-in table)*  | optional JSON override                            |
| `PORT`                | `4000`              |                                                   |
| `CORS_ORIGIN`         | `http://localhost:5173` | comma-separated                              |

`web/.env`: `VITE_GRAPHQL_URL` (default `http://localhost:4000/graphql`).

Config is parsed and validated once at boot — an invalid timezone or a missing
`JWT_SECRET` fails immediately rather than at the first request.

---

## Running tests

```bash
docker compose up -d          # the test database is a separate container on :5434

bun run test                  # unit tests — no database
bun run test:integration      # migrates the test DB, then runs the integration suite
bun run test:all              # both
```

**Unit tests** (`server/tests/unit`) cover the business-hours engine and the domain rules:
normal weekday maths, before/after business hours, weekends, Friday 17:00 and Friday
17:59, public holidays, weekend+holiday back to back, budgets crossing many business
days, both SLA clocks, the `AT_RISK` and `BREACHED` thresholds including the exact 75%
boundary, frozen clocks staying frozen, every status transition, and every validation rule.

**Integration tests** (`server/tests/integration`) run the *real* GraphQL Yoga handler
against the *real* PostgreSQL container — nothing is mocked. They cover the flow the
brief asks for — create ticket → reporter comment → agent comment → verify
`firstResponseAt` → verify the persisted SLA columns — plus authorization, invalid
transitions, validation errors, cursor pagination, every filter, sorting, the dashboard,
and the holiday recomputation. One test deliberately backdates a deadline in the database
and asserts the SQL `slaState` filter and the TypeScript engine reach the same verdict.

---

## Example GraphQL operations

The API is at `http://localhost:4000/graphql`. Authenticate with
`Authorization: Bearer <token>`.

```graphql
mutation Login {
  login(email: "agent@example.com", password: "password123") {
    token
    user { id name role }
  }
}
```

```graphql
mutation CreateTicket {
  createTicket(
    title: "Payment failed at checkout"
    description: "Pro customers see 'card declined' with a valid card."
    priority: URGENT
  ) {
    id
    number
    sla {
      firstResponseDueAt
      firstResponseState
      firstResponseRemainingMinutes
      resolution { dueAt state remainingMinutes budgetMinutes }
    }
  }
}
```

```graphql
query BreachedQueue {
  tickets(slaState: BREACHED, orderBy: SLA_DUE, take: 10) {
    nodes {
      number
      title
      priority
      status
      assignee { name }
      sla { overallState firstResponse { state remainingMinutes } }
    }
    totalCount
    pageInfo { hasNextPage endCursor }
  }
}
```

```graphql
mutation Reply { addComment(ticketId: "…", content: "Looking into it now.") { id createdAt } }
mutation Assign { assignTicket(ticketId: "…", assigneeId: "…") { assignee { name } } }
mutation Progress { changeTicketStatus(ticketId: "…", status: IN_PROGRESS) { status } }
mutation Resolve { resolveTicket(ticketId: "…") { status resolvedAt sla { resolution { state } } } }
mutation Holiday { createHoliday(date: "2026-08-15", name: "Independence Day") { id date name } }

query Dashboard { dashboard { openTickets inProgressTickets atRiskTickets breachedTickets } }
```

---

## Tradeoffs & known limitations

- **SLA targets are persisted, not derived on read.** This buys correct SQL-level
  filtering and pagination by SLA state, at the cost of having to recompute rows when the
  holiday calendar changes (which `holidayService` does, for in-flight tickets only).
- **`MET` is a fourth SLA state.** The brief lists three; a frozen, satisfied clock does
  not honestly fit any of them, and the brief's own UI mock shows "Met".
- **`remainingMinutes` can be negative.** It doubles as "minutes overdue" rather than
  needing a second field.
- **Reopening restarts the resolution budget** rather than accumulating across reopens.
  It is the defensible default; per-reopen history would need a `SlaClock` table.
- **The holiday calendar is global.** No per-team or per-customer calendars.
- **Timestamps are `String` in the schema**, ISO-8601 by construction, rather than a
  custom scalar — one fewer client-side dependency for a small API.
- **Pagination uses Prisma's `cursor` on `id`** with a deterministic multi-key ordering.
  Changing sort order invalidates an existing cursor, which the UI handles by resetting
  to the first page.
- **The frontend polls every 30s** instead of subscribing. Countdowns are recomputed by
  the server on each poll — the client never runs business-hour maths.
- **UI primitives are hand-written rather than pulled from Radix.** The app needs a button,
  badge, card, table, select and one dialog; the dialog implements Escape, backdrop
  dismissal, focus-on-open and scroll locking directly. That keeps the dependency list
  short, at the cost of the deeper accessibility work Radix would provide for free.
- **Motion is deliberately sparse.** Only the dialog animates (150ms); table rows and
  filters have no transition, because high-frequency controls feel laggy when they fade.
  `prefers-reduced-motion` is honoured.
- **Comment and event field resolvers are not batched.** They are only requested on the
  detail view, so there is no N+1 in the list; `reporter`/`assignee` *are* batched.
- **Rate limiting and observability** are not implemented.

## How I'd extend this

- **Pause the SLA while `WAITING_ON_CUSTOMER`** — a fifth status plus a `SlaPause` table
  recording paused intervals, subtracted by `businessMinutesBetween`.
- **Escalation & notifications** — a scheduled job walking `atRiskAt`/`dueAt` to notify an
  on-call agent, rather than the current compute-on-read-only model.
- **Per-team business calendars** — `BusinessCalendar` is already a value object passed
  into every engine function, so this is a lookup change, not a rewrite.
- **Recurring holidays** (e.g. "every 25 December") and bulk holiday import.
- **Agent performance metrics** — median first response, breach rate per agent, built on
  the existing `TicketEvent` audit trail.
- **GraphQL subscriptions** for live countdowns and queue updates instead of polling.
- **Codegen** for resolver types and frontend operation types, once the schema stops moving.
- **CI** running typecheck + unit + integration against a Postgres service container.
