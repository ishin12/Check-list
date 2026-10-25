import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCoords, parseMapsInput, toTaskLocation,
  type LocationParseError, type TaskLocation,
} from '@/domain/location';

export type LocationInputState = 'empty' | 'valid' | 'invalid';

interface Props {
  /** Starting value (used once, to fill the text box). */
  initial?: TaskLocation | null;
  /** Called on every change; `loc` is null unless the input is valid. */
  onChange: (loc: TaskLocation | null, state: LocationInputState) => void;
  disabled?: boolean;
}

function initialText(loc?: TaskLocation | null): string {
  if (!loc) return '';
  if (typeof loc.locationLat === 'number' && typeof loc.locationLng === 'number') {
    return loc.locationUrl ?? formatCoords(loc.locationLat, loc.locationLng);
  }
  return loc.locationUrl ?? '';
}

/** Optional Google Maps location: paste a link or "lat, lng", or use the device position. */
export function LocationInput({ initial, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => initialText(initial));
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const parsed = text.trim() ? parseMapsInput(text) : null;

  function apply(next: string) {
    setText(next);
    setGeoError(null);
    if (!next.trim()) { onChange(null, 'empty'); return; }
    const r = parseMapsInput(next);
    if (r.ok) onChange(toTaskLocation(r), 'valid');
    else onChange(null, 'invalid');
  }

  function useMyLocation() {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(t('location.geo.unsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        apply(formatCoords(pos.coords.latitude, pos.coords.longitude));
      },
      (err) => {
        setLocating(false);
        const key =
          err.code === err.PERMISSION_DENIED ? 'denied'
          : err.code === err.POSITION_UNAVAILABLE ? 'unavailable'
          : err.code === err.TIMEOUT ? 'timeout'
          : 'error';
        setGeoError(t(`location.geo.${key}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  let feedback: { tone: 'ok' | 'info' | 'error'; text: string } | null = null;
  if (parsed) {
    if (!parsed.ok) {
      feedback = { tone: 'error', text: t(`location.errors.${parsed.error satisfies LocationParseError}`) };
    } else if (parsed.lat !== undefined && parsed.lng !== undefined) {
      feedback = { tone: 'ok', text: t('location.found', { coords: formatCoords(parsed.lat, parsed.lng) }) };
    } else {
      feedback = { tone: 'info', text: t('location.linkOnly') };
    }
  }

  return (
    <div className="location-input">
      <input
        className="input location-input__text"
        dir="ltr"
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={text}
        placeholder={t('location.placeholder') ?? ''}
        aria-label={t('location.label') ?? ''}
        aria-invalid={parsed && !parsed.ok ? true : undefined}
        onChange={(e) => apply(e.target.value)}
      />
      <div className="location-input__actions">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={disabled || locating}
          onClick={useMyLocation}
        >
          {locating ? t('location.locating') : `📍 ${t('location.useMine')}`}
        </button>
        {text ? (
          <button type="button" className="btn btn--ghost" disabled={disabled} onClick={() => apply('')}>
            {t('location.clear')}
          </button>
        ) : null}
      </div>
      {!text ? <div className="hint">{t('location.hint')}</div> : null}
      {feedback ? (
        <div
          className={`location-input__feedback location-input__feedback--${feedback.tone}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </div>
      ) : null}
      {geoError ? <div className="location-input__feedback location-input__feedback--error" role="alert">{geoError}</div> : null}
    </div>
  );
}
