import { useState, type FormEvent } from 'react';
import { createTicket } from '@/api/operations';
import type { Priority } from '@/api/types';
import { ErrorBanner } from '@/components/domain';
import { Button, Dialog, Input, Label, Select, Textarea } from '@/components/ui';

const PRIORITY_HINTS: Record<Priority, string> = {
  URGENT: '1h response · 4h resolution',
  HIGH: '4h response · 24h resolution',
  MEDIUM: '8h response · 48h resolution',
  LOW: '24h response · 72h resolution',
};

export function CreateTicketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createTicket({ title, description, priority });
      onCreated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="New ticket"
      description="SLA deadlines are counted in business hours, Mon–Fri 09:00–18:00."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of the problem"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened, what you expected, and how to reproduce it"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {(Object.keys(PRIORITY_HINTS) as Priority[]).map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()} — {PRIORITY_HINTS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create ticket'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
