import type { ReactNode } from 'react';

// One page-heading pattern for every screen (issue #56): title left with an
// optional subtitle, actions right. No per-page header markup anymore.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}
