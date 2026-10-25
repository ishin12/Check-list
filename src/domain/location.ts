/**
 * Optional Google Maps location on a job. Pure helpers: parse what a manager
 * pastes (a Maps link or "lat, lng") and build the links workers tap.
 * No network access: short links (maps.app.goo.gl, goo.gl/maps) cannot be
 * resolved in the browser, so for those only the URL is kept.
 */

export type LocationParseError =
  | 'empty'            // nothing typed
  | 'invalid'          // not coordinates and not a URL we understand
  | 'not_https'        // a URL, but not https
  | 'unsupported_host' // https URL, but not a Google Maps host
  | 'out_of_range'     // latitude outside +-90 or longitude outside +-180
  | 'too_long';        // URL longer than MAX_URL_LENGTH

export type LocationParseResult =
  | { ok: true; url?: string; lat?: number; lng?: number }
  | { ok: false; error: LocationParseError };

export interface TaskLocation {
  locationUrl?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

export const MAX_URL_LENGTH = 2000;

const NUM = '[-+]?\\d+(?:\\.\\d+)?';
const RAW_COORDS = new RegExp(`^(${NUM})\\s*(?:,|;|\\s)\\s*(${NUM})$`);
const RE_3D4D = new RegExp(`!3d(${NUM})!4d(${NUM})`);
const RE_PARAM = new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=\\s*(${NUM})\\s*,\\s*(${NUM})(?=$|[&#\\s])`);
const RE_AT = new RegExp(`@(${NUM}),(${NUM})`);

const GOOGLE_HOST = /^(?:(?:www|maps)\.)?google\.(?:com?\.)?[a-z]{2,3}$/;
const MAPS_GOOGLE_HOST = /^maps\.google\.(?:com?\.)?[a-z]{2,3}$/;

export function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** True for https URLs on Google Maps hosts (the only links we store or open). */
export function isAllowedMapsUrl(raw: string): boolean {
  return classifyUrl(raw) === 'ok';
}

function classifyUrl(raw: string): 'ok' | 'not_https' | 'unsupported_host' | 'invalid' {
  let u: URL;
  try { u = new URL(raw); } catch { return 'invalid'; }
  if (u.protocol === 'http:') return 'not_https';
  if (u.protocol !== 'https:') return 'invalid';
  if (u.username || u.password || u.port) return 'unsupported_host';
  const host = u.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return 'ok';
  if (host === 'goo.gl') return u.pathname.startsWith('/maps') ? 'ok' : 'unsupported_host';
  if (MAPS_GOOGLE_HOST.test(host)) return 'ok';
  if (GOOGLE_HOST.test(host)) return u.pathname.startsWith('/maps') ? 'ok' : 'unsupported_host';
  return 'unsupported_host';
}

function isShortLink(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return host === 'maps.app.goo.gl' || host === 'goo.gl';
}

function safeDecode(s: string): string {
  const plus = s.replace(/\+/g, ' ');
  try { return decodeURIComponent(plus); } catch { return plus; }
}

function pair(m: RegExpMatchArray | null): { lat: number; lng: number } | null {
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

export function parseMapsInput(text: string): LocationParseResult {
  const input = (text ?? '').trim();
  if (!input) return { ok: false, error: 'empty' };

  const raw = RAW_COORDS.exec(input);
  if (raw) {
    const lat = Number(raw[1]);
    const lng = Number(raw[2]);
    if (!validCoords(lat, lng)) return { ok: false, error: 'out_of_range' };
    return { ok: true, lat, lng };
  }

  if (/\s/.test(input)) return { ok: false, error: 'invalid' };
  if (input.length > MAX_URL_LENGTH) return { ok: false, error: 'too_long' };

  // Allow a pasted link without its scheme ("maps.app.goo.gl/abc").
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`;
  const kind = classifyUrl(candidate);
  if (kind !== 'ok') return { ok: false, error: kind };

  const u = new URL(candidate);
  if (isShortLink(u)) return { ok: true, url: candidate };

  // !3d!4d is the place pin; @ is only the map viewport centre, so it ranks last.
  const decoded = safeDecode(u.pathname + u.search + u.hash);
  const found =
    pair(RE_3D4D.exec(decoded)) ?? pair(RE_PARAM.exec(decoded)) ?? pair(RE_AT.exec(decoded));
  if (!found) return { ok: true, url: candidate };
  if (!validCoords(found.lat, found.lng)) return { ok: false, error: 'out_of_range' };
  return { ok: true, url: candidate, lat: found.lat, lng: found.lng };
}

function hasCoords(loc: TaskLocation): loc is { locationLat: number; locationLng: number } {
  return typeof loc.locationLat === 'number' && typeof loc.locationLng === 'number' &&
    validCoords(loc.locationLat, loc.locationLng);
}

/** "Open in Google Maps" target: coordinates first, else the stored link, else null. */
export function mapsLinkFor(loc: TaskLocation): string | null {
  if (hasCoords(loc)) {
    return `https://www.google.com/maps/search/?api=1&query=${loc.locationLat},${loc.locationLng}`;
  }
  if (loc.locationUrl && isAllowedMapsUrl(loc.locationUrl)) return loc.locationUrl;
  return null;
}

/** Turn-by-turn link; only when coordinates exist. */
export function directionsLinkFor(loc: TaskLocation): string | null {
  if (!hasCoords(loc)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${loc.locationLat},${loc.locationLng}`;
}

export function hasLocation(loc: TaskLocation): boolean {
  return mapsLinkFor(loc) !== null;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Task-shaped values for a successful parse. */
export function toTaskLocation(r: { url?: string; lat?: number; lng?: number }): TaskLocation {
  return { locationUrl: r.url ?? null, locationLat: r.lat ?? null, locationLng: r.lng ?? null };
}
