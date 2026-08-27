import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import {
  fetchAgents,
  fetchDashboard,
  fetchTickets,
  type TicketQueryVariables,
} from '@/api/operations';
import type {
  Dashboard,
  Priority,
  SLAState,
  Ticket,
  TicketSortOrder,
  TicketStatus,
  User,
} from '@/api/types';
import { useAuth } from '@/auth';
import {
  EmptyState,
  ErrorBanner,
  PriorityBadge,
  SlaCell,
  StatusBadge,
} from '@/components/domain';
import { CreateTicketDialog } from '@/components/CreateTicketDialog';
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/components/ui';
import { formatRelative } from '@/format';
import { useDebounced } from '@/hooks';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const REFRESH_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;
const MAX_PAGE_SIZE = 50;

interface Filters {
  status: TicketStatus | '';
  priority: Priority | '';
  assigneeId: string;
  slaState: SLAState | '';
  search: string;
  orderBy: TicketSortOrder;
}

const EMPTY_FILTERS: Filters = {
  status: '',
  priority: '',
  assigneeId: '',
  slaState: '',
  search: '',
  orderBy: 'NEWEST',
};

function toVariables(filters: Filters, cursor: string | null): TicketQueryVariables {
  return {
    status: filters.status === '' ? null : filters.status,
    priority: filters.priority === '' ? null : filters.priority,
    assigneeId: filters.assigneeId === '' ? null : filters.assigneeId,
    slaState: filters.slaState === '' ? null : filters.slaState,
    search: filters.search.trim() === '' ? null : filters.search.trim(),
    orderBy: filters.orderBy,
    take: PAGE_SIZE,
    cursor,
  };
}

export function TicketListPage(): JSX.Element {
  const { viewer } = useAuth();
  const isAgent = viewer?.role === 'AGENT';

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const debouncedSearch = useDebounced(filters.search, SEARCH_DEBOUNCE_MS);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pageInfo, setPageInfo] = useState<{ hasNextPage: boolean; endCursor: string | null }>({
    hasNextPage: false,
    endCursor: null,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [agents, setAgents] = useState<User[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const latestRequest = useRef(0);
  const loadedCount = useRef(0);

  useEffect(() => {
    loadedCount.current = tickets.length;
  }, [tickets]);

  const query = useMemo<Filters>(
    () => ({
      status: filters.status,
      priority: filters.priority,
      assigneeId: filters.assigneeId,
      slaState: filters.slaState,
      orderBy: filters.orderBy,
      search: debouncedSearch,
    }),
    [
      filters.status,
      filters.priority,
      filters.assigneeId,
      filters.slaState,
      filters.orderBy,
      debouncedSearch,
    ],
  );

  const loadFirstPage = useCallback(
    async (size: number = PAGE_SIZE): Promise<void> => {
      const requestId = ++latestRequest.current;
      setError(null);
      try {
        const [connection, summary] = await Promise.all([
          fetchTickets({ ...toVariables(query, null), take: Math.min(size, MAX_PAGE_SIZE) }),
          fetchDashboard(),
        ]);
        if (requestId !== latestRequest.current) return;
        setTickets(connection.nodes);
        setPageInfo(connection.pageInfo);
        setTotalCount(connection.totalCount);
        setDashboard(summary);
      } catch (caught) {
        if (requestId === latestRequest.current) setError(caught);
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    setLoading(true);
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    const timer = window.setInterval(
      () => void loadFirstPage(Math.max(PAGE_SIZE, loadedCount.current)),
      REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [loadFirstPage]);

  useEffect(() => {
    if (!isAgent) return;
    fetchAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [isAgent]);

  async function loadMore(): Promise<void> {
    if (!pageInfo.hasNextPage) return;
    try {
      const connection = await fetchTickets(toVariables(query, pageInfo.endCursor));
      setTickets((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...connection.nodes.filter((entry) => !seen.has(entry.id))];
      });
      setPageInfo(connection.pageInfo);
    } catch (caught) {
      setError(caught);
    }
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support tickets</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} ticket{totalCount === 1 ? '' : 's'}
            {isAgent ? ' in the queue' : ' raised by you'}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New ticket
        </Button>
      </div>

      <ErrorBanner error={error} />

      {dashboard !== null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Open" value={dashboard.openTickets} />
          <Stat label="In progress" value={dashboard.inProgressTickets} />
          <Stat label="Resolved" value={dashboard.resolvedTickets} />
          <Stat label="Unassigned" value={dashboard.unassignedTickets} />
          <Stat label="At risk" value={dashboard.atRiskTickets} tone="warning" />
          <Stat label="Breached" value={dashboard.breachedTickets} tone="danger" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Search title or description…"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
          />
        </div>
        <Select
          className="w-auto"
          aria-label="Status"
          value={filters.status}
          onChange={(e) => update('status', e.target.value as TicketStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </Select>
        <Select
          className="w-auto"
          aria-label="Priority"
          value={filters.priority}
          onChange={(e) => update('priority', e.target.value as Priority | '')}
        >
          <option value="">All priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </Select>
        <Select
          className="w-auto"
          aria-label="SLA state"
          value={filters.slaState}
          onChange={(e) => update('slaState', e.target.value as SLAState | '')}
        >
          <option value="">Any SLA state</option>
          <option value="ON_TRACK">On track</option>
          <option value="AT_RISK">At risk</option>
          <option value="BREACHED">Breached</option>
          <option value="MET">Met</option>
        </Select>
        {isAgent && (
          <Select
            className="w-auto"
            aria-label="Assignee"
            value={filters.assigneeId}
            onChange={(e) => update('assigneeId', e.target.value)}
          >
            <option value="">Any assignee</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="w-auto"
          aria-label="Sort order"
          value={filters.orderBy}
          onChange={(e) => update('orderBy', e.target.value as TicketSortOrder)}
        >
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="PRIORITY">Highest priority</option>
          <option value="SLA_DUE">Soonest SLA deadline</option>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            <X /> Reset
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : tickets.length === 0 ? (
        <EmptyState title="No tickets match these filters">
          {filtered ? 'Try widening or resetting the filters.' : 'Raise the first one.'}
        </EmptyState>
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/tickets/${ticket.id}`} className="font-medium leading-snug">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                    #{ticket.number}
                  </span>
                  {ticket.title}
                </Link>
                <PriorityBadge priority={ticket.priority} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} />
                <span className="text-xs text-muted-foreground">
                  {ticket.assignee?.name ?? 'Unassigned'} · {formatRelative(ticket.createdAt)}
                </span>
              </div>
              <div className="mt-3">
                <SlaCell ticket={ticket} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="hidden overflow-hidden py-0 md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-40">Assignee</TableHead>
                <TableHead className="w-64">SLA</TableHead>
                <TableHead className="w-24 text-right">Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{ticket.number}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {ticket.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {ticket.assignee?.name ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SlaCell ticket={ticket} />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelative(ticket.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        </>
      )}

      {pageInfo.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}

      {creating && (
        <CreateTicketDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void loadFirstPage();
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warning' | 'danger';
}): JSX.Element {
  return (
    <Card className="px-4 py-3">
      <p
        className={cn(
          'text-2xl font-semibold tracking-tight',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && value > 0 && 'text-destructive',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
