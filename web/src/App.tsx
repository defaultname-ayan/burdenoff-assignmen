import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { Moon, Sun, Timer } from 'lucide-react';
import { AuthProvider, useAuth } from '@/auth';
import { useTheme, type Theme } from '@/theme';
import { LoginPage } from '@/pages/LoginPage';
import { TicketListPage } from '@/pages/TicketListPage';
import { TicketDetailPage } from '@/pages/TicketDetailPage';
import { RoleTag } from '@/components/domain';
import { Button, Skeleton } from '@/components/ui';

function Shell({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }): JSX.Element {
  const { viewer, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (viewer === null) return <LoginPage theme={theme} onToggleTheme={toggleTheme} />;

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Timer className="size-4" aria-hidden="true" />
              SLA Tracker
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {viewer.name}
                <RoleTag role={viewer.role} />
              </span>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<TicketListPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export function App(): JSX.Element {
  const { theme, toggle } = useTheme();
  return (
    <AuthProvider>
      <Shell theme={theme} toggleTheme={toggle} />
    </AuthProvider>
  );
}
