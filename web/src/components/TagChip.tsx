import { X } from 'lucide-react';

// One tag chip look across the app: accent-tinted mono label, optional
// remove button (used by the active filter chips).
export function TagChip({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 py-0.5 font-mono text-[12px] text-accent">
      {name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag filter ${name}`}
          className="text-subtle hover:text-text"
          onClick={onRemove}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}
