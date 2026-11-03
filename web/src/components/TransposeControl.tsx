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
      className={`seg-group ${className}`}
      role="group"
      aria-label="Transpose"
    >
      <button
        type="button"
        aria-label="Transpose down"
        onClick={() => onKeyOffsetChange(keyOffset - 1)}
        className="seg-btn seg-btn-icon"
      >
        <Minus size={14} />
      </button>
      <span
        className="flex h-[36px] w-10 items-center justify-center font-mono text-[11px] tabular-nums text-muted"
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
        className="seg-btn seg-btn-icon"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
