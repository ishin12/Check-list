import { Icon } from './Icon';

/**
 * Direction-aware chevron, now a thin wrapper over the shared Icon set.
 * "back" points to the inline-start side, "forward" to the inline-end side;
 * global.css flips both for html[dir='rtl'] (`.icon--dir`).
 */
export function Chevron({ kind }: { kind: 'back' | 'forward' }) {
  return <Icon name={kind} />;
}
