/**
 * The two-leaf sprout on its forest plate, as in public/favicon.svg.
 * On the forest hero the plate and the page are the same tone, so only the
 * glyph reads there; on a white card the plate shows.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <rect width="64" height="64" rx="12" fill="#003C1B" />
      <g transform="translate(32 34)" fill="#00C481">
        <path d="M -2 -2 C -16 -4 -22 -16 -14 -24 C -6 -16 -2 -10 -2 -2 Z" />
        <path d="M 2 -2 C 16 -4 22 -16 14 -24 C 6 -16 2 -10 2 -2 Z" />
        <rect x="-1.6" y="-3" width="3.2" height="22" rx="1.6" />
      </g>
      <path d="M 22 56 Q 32 50 42 56" fill="none" stroke="#D7CE6D" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
