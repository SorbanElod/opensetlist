import { Minus, Plus } from 'lucide-react';

import { keyAtOffset } from '../lib/transpose';

// Live transpose control: - key +, one semitone per click. Render-time only
// — the stored ABC and the arrangement's key are never rewritten; persisting
// a key for a setlist item happens in the setlist detail editor.
export function TransposeControl({
  baseKey,
  keyOffset,
  onKeyOffsetChange,
  className = '',
}: {
  baseKey: string;
  keyOffset: number;
  onKeyOffsetChange: (offset: number) => void;
  className?: string;
}) {
  const effectiveKey =
    keyOffset === 0 ? baseKey : keyAtOffset(baseKey, keyOffset);
  return (
    <div
      className={`inline-flex items-center rounded-md border border-border bg-bg p-0.5 ${className}`}
      role="group"
      aria-label="Transpose"
    >
      <button
        type="button"
        aria-label="Transpose down"
        onClick={() => onKeyOffsetChange(keyOffset - 1)}
        className="flex h-[26px] w-[26px] items-center justify-center rounded text-muted transition-colors hover:text-text"
      >
        <Minus size={13} />
      </button>
      <span
        className="w-10 text-center font-mono text-[11px] tabular-nums text-muted"
        title={`Key: ${effectiveKey}${keyOffset !== 0 ? ` (${keyOffset > 0 ? `+${keyOffset}` : keyOffset} from ${baseKey})` : ''}`}
      >
        {effectiveKey}
        {keyOffset !== 0 && (
          <span className="text-accent">
            {keyOffset > 0 ? `+${keyOffset}` : keyOffset}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label="Transpose up"
        onClick={() => onKeyOffsetChange(keyOffset + 1)}
        className="flex h-[26px] w-[26px] items-center justify-center rounded text-muted transition-colors hover:text-text"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
