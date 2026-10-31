import { useEffect, useRef, useState } from 'react';
import { renderAbc } from 'abcjs';

// Live abcjs preview. Re-renders ~200ms after the last keystroke — rendering
// on every keystroke would jank on long sections. A parse problem never
// crashes the editor: abcjs renders what it can, and anything thrown becomes
// an inline warning while typing.
export function AbcPreview({ abc }: { abc: string }) {
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
    }, 200);

    return () => clearTimeout(handle);
  }, [abc]);

  return (
    <div>
      {/* abcjs draws its SVG with currentColor, so the notation follows the
          theme text color: white-on-dark in dark mode, black-on-light in
          light mode. No fixed white card — that washed the notation out. */}
      <div
        ref={targetRef}
        data-testid="abc-preview"
        className="overflow-x-auto rounded-lg p-2 text-text [&_svg]:max-w-full"
      />
      {warning && <p className="field-error">{warning}</p>}
    </div>
  );
}
