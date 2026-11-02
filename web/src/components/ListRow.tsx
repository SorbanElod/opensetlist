import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

// One row pattern for every list (songs, arrangements — issue #56): title +
// meta left, trailing chips/actions, chevron right when the row navigates.
// Renders a Link when `to` is set, a button when `onClick` is set, a plain
// div otherwise. Must be a direct child of a .list container — the hairline
// dividers between rows come from `.list > * + *` in index.css.
export function ListRow({
  title,
  meta,
  trailing,
  to,
  onClick,
  as,
}: {
  title: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  as?: 'li';
}) {
  const navigable = Boolean(to ?? onClick);
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{title}</div>
        {meta && (
          <div className="truncate text-[11.5px] text-muted">{meta}</div>
        )}
      </div>
      {trailing}
      {navigable && <ChevronRight size={16} className="shrink-0 text-subtle" />}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="list-row">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="list-row" onClick={onClick}>
        {body}
      </button>
    );
  }
  if (as === 'li') {
    return <li className="list-row">{body}</li>;
  }
  return <div className="list-row">{body}</div>;
}
