import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): JSX.Element {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return <tr className={cn('border-b hover:bg-muted/50', className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      className={cn(
        'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
