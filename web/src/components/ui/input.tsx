import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const field =
  'flex w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] duration-[120ms] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={cn(field, 'h-9', className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className={cn(field, 'min-h-16 py-2 resize-y', className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <select
      className={cn(
        field,
        'h-9 cursor-pointer appearance-none bg-no-repeat pr-8',
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m4 6 4 4 4-4%22/%3E%3C/svg%3E')]",
        'bg-[position:right_0.6rem_center]',
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): JSX.Element {
  return (
    <label
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}
