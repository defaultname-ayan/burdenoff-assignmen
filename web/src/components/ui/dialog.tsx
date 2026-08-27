import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button.js';

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  className,
}: DialogProps): JSX.Element {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 [animation:overlay-in_120ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg',
          '[animation:dialog-in_150ms_cubic-bezier(0.16,1,0.3,1)]',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description !== undefined && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
