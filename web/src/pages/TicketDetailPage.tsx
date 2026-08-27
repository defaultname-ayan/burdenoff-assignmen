import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCheck, Send } from 'lucide-react';
import {
  addComment,
  assignTicket,
  changeStatus,
  fetchAgents,
  fetchTicket,
  resolveTicket,
} from '@/api/operations';
import type { SLAClock, TicketDetail, TicketStatus, User } from '@/api/types';
import { useAuth } from '@/auth';
import {
  EmptyState,
  ErrorBanner,
  PriorityBadge,
  RoleTag,
  SlaIndicator,
  SlaMeter,
  StatusBadge,
} from '@/components/domain';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { describeClock, formatDateTime, formatRelative } from '@/format';

const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: ['OPEN'],
};

function statusLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'OPEN' && (from === 'RESOLVED' || from === 'CLOSED')) return 'Reopen';
  if (to === 'OPEN') return 'Move to open';
  return to.charAt(0) + to.slice(1).toLowerCase().replace('_', ' ');
}

export function TicketDetailPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const { viewer } = useAuth();
  const isAgent = viewer?.role === 'AGENT';

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [agents, setAgents] = useState<User[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setTicket(await fetchTicket(id));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAgent) return;
    fetchAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [isAgent]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      await addComment(id, comment);
      setComment('');
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-96" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (ticket === null) {
    return (
      <EmptyState title="Ticket not found">
        <p>It does not exist, or you do not have access to it.</p>
        <Link className="underline underline-offset-4" to="/">
          Back to tickets
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="mr-2 font-mono text-lg text-muted-foreground">#{ticket.number}</span>
            {ticket.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Raised by {ticket.reporter.name} · {formatDateTime(ticket.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comments ({ticket.comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-3">
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <ul className="space-y-4">
                  {ticket.comments.map((entry) => (
                    <li key={entry.id} className="border-l-2 pl-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{entry.author.name}</span>
                        <RoleTag role={entry.author.role} />
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </span>
                        {ticket.firstResponseAt === entry.createdAt && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                            <CheckCheck className="size-3" aria-hidden="true" /> first response
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{entry.content}</p>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitComment} className="space-y-2 border-t pt-4">
                <Textarea
                  rows={3}
                  value={comment}
                  placeholder={
                    isAgent ? 'Reply to the reporter…' : 'Add more detail for the support team…'
                  }
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy}>
                    <Send /> Add comment
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {ticket.events.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <ul className="space-y-2 text-sm">
                  {ticket.events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground">
                        {formatRelative(event.createdAt)}
                      </span>
                      <span>
                        {event.type === 'STATUS_CHANGED'
                          ? `Status ${event.fromValue} → ${event.toValue}`
                          : 'Assignee changed'}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SLA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-3">
              <ClockPanel label="First response" clock={ticket.sla.firstResponse} />
              <ClockPanel label="Resolution" clock={ticket.sla.resolution} />
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Deadlines are counted in business hours and calculated by the server.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <p className="text-sm">
                {ticket.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}
              </p>
              {isAgent ? (
                <Select
                  aria-label="Assign to"
                  value={ticket.assignee?.id ?? ''}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next !== '') void run(() => assignTicket(id, next));
                  }}
                >
                  <option value="">Select an agent…</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">Only agents can assign tickets.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {isAgent ? (
                <div className="flex flex-wrap gap-2">
                  {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                    <Button size="sm" disabled={busy} onClick={() => void run(() => resolveTicket(id))}>
                      Resolve
                    </Button>
                  )}
                  {NEXT_STATUSES[ticket.status].map((status) => (
                    <Button
                      key={status}
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => changeStatus(id, status))}
                    >
                      {statusLabel(ticket.status, status)}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only agents can change a ticket&apos;s status.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClockPanel({ label, clock }: { label: string; clock: SLAClock }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <SlaIndicator clock={clock} />
      </div>
      <SlaMeter clock={clock} />
      <p className="text-xs text-muted-foreground">
        Due {formatDateTime(clock.dueAt)} · {describeClock(clock)}
      </p>
    </div>
  );
}
