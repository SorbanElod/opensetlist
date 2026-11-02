// Home: placeholder until P3 setlists land — the shell header/nav comes
// from AppShell.
import { EmptyState } from '../components/EmptyState';

export function HomePage() {
  return (
    <EmptyState>
      Song library is at <span className="font-semibold text-text">Songs</span>{' '}
      — setlists land in P3.
    </EmptyState>
  );
}
