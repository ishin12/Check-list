/**
 * One inline-SVG icon set for the whole app.
 *
 * Authored in-house on a 24px grid with a single 1.75 stroke, round caps and
 * joins, no fills (the same outline style as Heroicons / Lucide, but every path
 * here is original, so no third-party licence applies).
 *
 * - Painted with currentColor, so colour comes from the parent text colour.
 * - aria-hidden: icons are decorative; put the accessible name on the button,
 *   link or label that contains them.
 * - Sized in CSS (`.icon` = 1.25em, `.icon--lg`, `.icon--xl`).
 * - Directional icons ('back', 'forward', 'sign-out', 'chevron-*') are flipped
 *   in RTL by global.css via the `icon--dir` class.
 */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.7 2.7L16 9.5" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.7 2.7L16 9.5" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M15.8 4.7a3.4 3.4 0 0 1 0 6.5M18 14.3c2.2.6 3.5 2.5 3.5 5.7" />
    </>
  ),
  inbox: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5z" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 18.5c1.3-2.2 3.3-3 6-3s4.7.8 6 3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  edit: <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19l-4 1zM14.5 6.5l3 3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  'sign-out': <path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" />,
  list: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 17h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h5" />
      <path d="M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  share: <path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />,
  users: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  'chevron-down': <path d="M5 9l7 7 7-7" />,
};

/** Icons whose artwork has a direction and must be mirrored in RTL. */
const DIRECTIONAL = new Set(['back', 'forward', 'sign-out']);

export type IconName = keyof typeof P;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const cls = ['icon', `icon--${name}`, DIRECTIONAL.has(name) ? 'icon--dir' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
