/**
 * Direction-aware chevron. Drawn as SVG so it never depends on Unicode bidi
 * mirroring of ‹ › (which made the back arrow point the wrong way in RTL).
 * "back" points to the inline-start side, "forward" to the inline-end side;
 * global.css flips it for html[dir='rtl'].
 */
export function Chevron({ kind }: { kind: 'back' | 'forward' }) {
  return (
    <svg
      className={`chev chev--${kind}`}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
