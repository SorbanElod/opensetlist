import { useEffect, useRef, useState } from 'react';
import { renderAbc } from 'abcjs';

// Shared abcjs renderer (issue #10): the editor's live preview and the
// sheet view both render through this component — always from the same
// stored ABC text, nothing derived is persisted.
//
// debounceMs exists for the editor (rendering on every keystroke would jank
// on long sections); the view page renders immediately (0). A parse problem
// never crashes the page: abcjs renders what it can, and anything thrown
// becomes an inline warning.
export function AbcRenderer({
  abc,
  debounceMs = 0,
  scale,
}: {
  abc: string;
  debounceMs?: number;
  // Zoom scale for the sheet view (issue #59, fixed in #62). abcjs ignores
  // its own scale param in responsive mode, so a non-1 scale renders
  // non-responsive at the scaled size and the wrapper scrolls horizontally
  // instead of truncating the staff. undefined / 1 = fit-to-width default.
  scale?: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const scaled = scale !== undefined && scale !== 1;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const handle = setTimeout(() => {
      if (!abc.trim()) {
        target.innerHTML = '';
        setWarning(null);
        return;
      }
      try {
        // Default: responsive 'resize' fits the staff to the container width
        // (the primary device is a phone on stage). When zoomed, render at
        // the scaled size instead — the SVG keeps its explicit scaled width
        // (no max-w-full) and the wrapper's overflow-x-auto scrolls.
        renderAbc(
          target,
          abc,
          scaled ? { scale: scale! } : { responsive: 'resize' },
        );
        setWarning(null);
      } catch {
        target.innerHTML = '';
        setWarning('This ABC cannot be rendered yet — it may be mid-edit.');
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [abc, debounceMs, scale, scaled]);

  return (
    <div>
      {/* abcjs draws its SVG with currentColor, so the notation follows the
          theme text color: white-on-dark in dark mode, black-on-light in
          light mode. No fixed white card — that washed the notation out.
          max-w-full constrains the SVG only in fit-to-width mode; when zoomed
          the SVG keeps its scaled width and this wrapper scrolls instead. */}
      <div
        ref={targetRef}
        data-testid="abc-renderer"
        className={`overflow-x-auto rounded-lg p-1 text-text ${scaled ? '' : '[&_svg]:max-w-full'}`}
      />
      {warning && <p className="field-error">{warning}</p>}
    </div>
  );
}
