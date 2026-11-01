import type { Language } from '@/domain/models/types';
import { formatDate, formatDateTime, formatTime } from '@/lib/datetime';

/**
 * A visit's date and time. In Urdu the numeric time ("10:00 AM") sits inside
 * right-to-left text and reorders itself, so it is isolated as one
 * left-to-right run; the date keeps its Urdu month name.
 */
export function VisitWhen({ iso, language }: { iso: string; language: Language }) {
  if (language !== 'ur') return <>{formatDateTime(iso, language)}</>;
  return (
    <>
      {formatDate(iso, language, { dateStyle: 'medium' })}، <bdi dir="ltr">{formatTime(iso, language, { timeStyle: 'short' })}</bdi>
    </>
  );
}
