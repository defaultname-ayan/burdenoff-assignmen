import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }): JSX.Element {
  return (
    <div className="divide-y rounded-xl border">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
