import { useState, type FormEvent } from 'react';
import { Moon, Sun, Timer } from 'lucide-react';
import { login as loginRequest, register as registerRequest } from '@/api/operations';
import { useAuth } from '@/auth';
import { ErrorBanner } from '@/components/domain';
import { Button, Card, CardContent, Input, Label, Select } from '@/components/ui';
import type { UserRole } from '@/api/types';

type Mode = 'login' | 'register';

export function LoginPage({
  theme,
  onToggleTheme,
}: {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}): JSX.Element {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('agent@example.com');
  const [password, setPassword] = useState('password123');
  const [role, setRole] = useState<UserRole>('REPORTER');
  const [agentCode, setAgentCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload =
        mode === 'login'
          ? await loginRequest(email, password)
          : await registerRequest({
              name,
              email,
              password,
              role,
              ...(role === 'AGENT' ? { agentCode } : {}),
            });
      signIn(payload.token, payload.user);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center p-4">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl border bg-card shadow-sm">
            <Timer className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Support Ticket &amp; SLA Tracker</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Sign in to continue.' : 'Create an account to raise tickets.'}
          </p>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <ErrorBanner error={error} />

              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                    >
                      <option value="REPORTER">Reporter</option>
                      <option value="AGENT">Agent (support staff)</option>
                    </Select>
                  </div>
                  {role === 'AGENT' && (
                    <div className="space-y-2">
                      <Label htmlFor="agentCode">Agent signup code</Label>
                      <Input
                        id="agentCode"
                        value={agentCode}
                        onChange={(e) => setAgentCode(e.target.value)}
                        placeholder="AGENT_SIGNUP_CODE from the server .env"
                      />
                    </div>
                  )}
                </>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3 text-center">
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Seeded logins: <code className="font-mono">agent@example.com</code> ·{' '}
            <code className="font-mono">reporter@example.com</code> — password{' '}
            <code className="font-mono">password123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
