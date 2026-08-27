import { AlertCircle, CheckCircle2, CircleAlert, CircleDot, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { GraphQLRequestError } from '@/api/client';
import type { Priority, SLAClock, SLAInfo, SLAState, TicketStatus } from '@/api/types';

type TicketSla = SLAInfo;
import { SLA_LABEL, describeClock } from '@/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PRIORITY_VARIANT = {
  URGENT: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'outline',
} as const;

export function PriorityBadge({ priority }: { priority: Priority }): JSX.Element {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className="uppercase">
      {priority}
    </Badge>
  );
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-500',
  IN_PROGRESS: 'bg-warning',
  RESOLVED: 'bg-success',
  CLOSED: 'bg-muted-foreground',
};

export function StatusBadge({ status }: { status: TicketStatus }): JSX.Element {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn('size-1.5 rounded-full', STATUS_STYLE[status])} aria-hidden="true" />
      {status.replace('_', ' ')}
    </Badge>
  );
}

const SLA_ICON: Record<SLAState, typeof Clock> = {
  ON_TRACK: CircleDot,
  AT_RISK: CircleAlert,
  BREACHED: AlertCircle,
  MET: CheckCircle2,
};

const SLA_COLOR: Record<SLAState, string> = {
  ON_TRACK: 'text-muted-foreground',
  AT_RISK: 'text-warning',
  BREACHED: 'text-destructive',
  MET: 'text-success',
};

export function SlaIndicator({ clock }: { clock: SLAClock }): JSX.Element {
  const Icon = SLA_ICON[clock.state];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm', SLA_COLOR[clock.state])}
      title={describeClock(clock)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className={cn(clock.state === 'BREACHED' && 'font-medium')}>
        {SLA_LABEL[clock.state]}
      </span>
      {!clock.completed && (
        <span className="text-muted-foreground">· {describeClock(clock)}</span>
      )}
    </span>
  );
}

const METER_FILL: Record<SLAState, string> = {
  BREACHED: 'bg-destructive',
  AT_RISK: 'bg-warning',
  MET: 'bg-success',
  ON_TRACK: 'bg-foreground/50',
};

export function SlaMeter({
  clock,
  className,
}: {
  clock: SLAClock;
  className?: string;
}): JSX.Element {
  const consumed = clock.budgetMinutes - clock.remainingMinutes;
  const percent = Math.min(100, Math.max(0, (consumed / clock.budgetMinutes) * 100));

  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
      role="presentation"
    >
      <div
        className={cn('h-full rounded-full', METER_FILL[clock.state])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SlaCell({ ticket }: { ticket: { sla: TicketSla } }): JSX.Element {
  const clock = ticket.sla.firstResponse.completed
    ? ticket.sla.resolution
    : ticket.sla.firstResponse;
  const label = ticket.sla.firstResponse.completed ? 'Resolution' : 'First response';

  return (
    <div className="min-w-44 space-y-1">
      <SlaIndicator clock={clock} />
      <SlaMeter clock={clock} />
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }): JSX.Element | null {
  if (error === null || error === undefined) return null;
  const isGraphQL = error instanceof GraphQLRequestError;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>{message}</p>
        {isGraphQL && (
          <p className="font-mono text-xs opacity-80">
            {error.code}
            {error.field !== null && ` · field: ${error.field}`}
          </p>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children !== undefined && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function RoleTag({ role }: { role: string }): JSX.Element {
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium tracking-wide">
      {role}
    </Badge>
  );
}
