import { useEffect, useRef, useState } from 'react';
import { renderAbc } from 'abcjs';

// Shared abcjs renderer (issue #10): the editor's live preview and the
// on-stage view page both render through this component. The caller decides
// what ABC to pass — the lyrics view passes the chord-stripped text (see
// stripChords in lib/abcViews), so no derived copy is ever stored.
//
// debounceMs exists for the editor (rendering on every keystroke would jank
// on long sections); the view page renders immediately (0). A parse problem
// never crashes the page: abcjs renders what it can, and anything thrown
// becomes an inline warning.
export function AbcRenderer({
  abc,
  debounceMs = 0,
}: {
  abc: string;
  debounceMs?: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [warning, setWarning] = useState<string | null>(null);

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
        // responsive: 'resize' fits the staff to the container width — the
        // primary device is a phone on stage, so notation must not overflow.
        renderAbc(target, abc, { responsive: 'resize' });
        setWarning(null);
      } catch {
        target.innerHTML = '';
        setWarning('This ABC cannot be rendered yet — it may be mid-edit.');
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [abc, debounceMs]);

  return (
    <div>
      {/* abcjs draws its SVG with currentColor, so the notation follows the
          theme text color: white-on-dark in dark mode, black-on-light in
          light mode. No fixed white card — that washed the notation out. */}
      <div
        ref={targetRef}
        data-testid="abc-renderer"
        className="overflow-x-auto rounded-lg p-2 text-text [&_svg]:max-w-full"
      />
      {warning && <p className="field-error">{warning}</p>}
    </div>
  );
}
