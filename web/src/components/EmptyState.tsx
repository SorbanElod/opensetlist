import type { ReactNode } from 'react';
import { Link } from 'react-router';

// One empty-state pattern (issue #56): a panel with a message and an
// optional call-to-action link.
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: { to: string; label: string };
}) {
  return (
    <div className="card p-5">
      <p className="text-[13.5px] text-muted">{children}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-3 inline-flex font-semibold text-accent"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
