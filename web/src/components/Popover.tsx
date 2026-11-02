import { useEffect, useRef, type ReactNode } from 'react';

// Anchored popover (filter UI): renders `anchor` plus, when open, a panel
// docked to the anchor's bottom-right. Closes on outside mousedown and
// Escape. The wrapper is the positioning context AND the outside-click
// boundary, so clicking the anchor toggles instead of close-then-reopen.
export function Popover({
  open,
  onClose,
  label,
  anchor,
  children,
  panelClassName = '',
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  anchor: ReactNode;
  children: ReactNode;
  panelClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {anchor}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`absolute right-0 top-full z-10 mt-1 rounded-lg border border-border bg-surface p-3 shadow-lg ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
