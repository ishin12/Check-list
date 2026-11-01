import { useTranslation } from 'react-i18next';
import { embedMapLinkFor, type TaskLocation } from '@/domain/location';

/** Embedded Google map with the provider's native pan/zoom controls. */
export function LocationMap({ location }: { location: TaskLocation }) {
  const { t } = useTranslation();
  const src = embedMapLinkFor(location);
  if (!src) return null;
  return (
    <div className="location-map">
      <iframe
        title={t('location.mapTitle', 'Location map')}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
