import { useEffect, useRef } from 'react';

/**
 * A refusal or failure message that scrolls itself into view, so a tap that
 * was refused never looks like it did nothing (UAT D-22).
 */
export function ErrorBanner({ message }: { message: string | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [message]);
  if (!message) return null;
  return <div ref={ref} className="banner banner--error" role="alert">{message}</div>;
}
