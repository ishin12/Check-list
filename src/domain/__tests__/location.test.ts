import { describe, expect, it } from 'vitest';
import { directionsLinkFor, hasLocation, mapsLinkFor, parseMapsInput } from '../location';

describe('parseMapsInput', () => {
  it('parses raw coordinates in several shapes', () => {
    expect(parseMapsInput('24.7136, 46.6753')).toEqual({ ok: true, lat: 24.7136, lng: 46.6753 });
    expect(parseMapsInput('24.7136,46.6753')).toEqual({ ok: true, lat: 24.7136, lng: 46.6753 });
    expect(parseMapsInput('  -33.86   151.21 ')).toEqual({ ok: true, lat: -33.86, lng: 151.21 });
    expect(parseMapsInput('-12.5, -70.25')).toEqual({ ok: true, lat: -12.5, lng: -70.25 });
  });

  it('rejects empty and nonsense', () => {
    expect(parseMapsInput('   ')).toEqual({ ok: false, error: 'empty' });
    expect(parseMapsInput('Riyadh olaya')).toEqual({ ok: false, error: 'invalid' });
    expect(parseMapsInput('hello')).toEqual({ ok: false, error: 'unsupported_host' });
  });

  it('validates ranges', () => {
    expect(parseMapsInput('91, 10')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseMapsInput('10, 181')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseMapsInput('https://www.google.com/maps/@95.0,46.0,15z')).toEqual({ ok: false, error: 'out_of_range' });
  });

  it('reads @lat,lng,zoom', () => {
    const url = 'https://www.google.com/maps/@24.7136,46.6753,15z';
    expect(parseMapsInput(url)).toEqual({ ok: true, url, lat: 24.7136, lng: 46.6753 });
  });

  it('reads ?q=lat,lng and &query=lat,lng', () => {
    expect(parseMapsInput('https://maps.google.com/?q=24.7136,46.6753'))
      .toMatchObject({ ok: true, lat: 24.7136, lng: 46.6753 });
    expect(parseMapsInput('https://www.google.com/maps/search/?api=1&query=24.7136%2C46.6753'))
      .toMatchObject({ ok: true, lat: 24.7136, lng: 46.6753 });
  });

  it('reads ll=lat,lng', () => {
    expect(parseMapsInput('https://maps.google.com/maps?ll=-1.5,36.8&z=12'))
      .toMatchObject({ ok: true, lat: -1.5, lng: 36.8 });
  });

  it('prefers !3d!4d over the @ viewport centre', () => {
    const url = 'https://www.google.com/maps/place/Tower/@24.7000,46.6000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d24.7136!4d46.6753';
    expect(parseMapsInput(url)).toMatchObject({ ok: true, lat: 24.7136, lng: 46.6753 });
  });

  it('handles /place/.../@... with names', () => {
    expect(parseMapsInput('https://www.google.com/maps/place/Al+Manar+Tower/@24.69,46.72,16z'))
      .toMatchObject({ ok: true, lat: 24.69, lng: 46.72 });
  });

  it('keeps short links as url only', () => {
    expect(parseMapsInput('https://maps.app.goo.gl/AbC123xyz')).toEqual({ ok: true, url: 'https://maps.app.goo.gl/AbC123xyz' });
    expect(parseMapsInput('https://goo.gl/maps/AbC123')).toEqual({ ok: true, url: 'https://goo.gl/maps/AbC123' });
    expect(parseMapsInput('maps.app.goo.gl/AbC123')).toEqual({ ok: true, url: 'https://maps.app.goo.gl/AbC123' });
  });

  it('keeps a Google URL without coordinates as url only', () => {
    const url = 'https://www.google.com/maps/place/Some+Place';
    expect(parseMapsInput(url)).toEqual({ ok: true, url });
  });

  it('accepts regional Google domains', () => {
    expect(parseMapsInput('https://www.google.com.sa/maps/@24.7,46.7,15z')).toMatchObject({ ok: true, lat: 24.7 });
    expect(parseMapsInput('https://maps.google.de/?q=1,2')).toMatchObject({ ok: true, lat: 1, lng: 2 });
  });

  it('rejects http, other hosts and lookalikes', () => {
    expect(parseMapsInput('http://maps.google.com/?q=1,2')).toEqual({ ok: false, error: 'not_https' });
    expect(parseMapsInput('https://example.com/maps/@1,2,3z')).toEqual({ ok: false, error: 'unsupported_host' });
    expect(parseMapsInput('https://google.com.evil.com/maps/@1,2,3z')).toEqual({ ok: false, error: 'unsupported_host' });
    expect(parseMapsInput('https://evilgoogle.com/maps/@1,2,3z')).toEqual({ ok: false, error: 'unsupported_host' });
    expect(parseMapsInput('https://www.google.com/search?q=1,2')).toEqual({ ok: false, error: 'unsupported_host' });
    expect(parseMapsInput('https://user@www.google.com/maps/@1,2,3z')).toEqual({ ok: false, error: 'unsupported_host' });
    expect(parseMapsInput('javascript:alert(1)')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects over-long URLs', () => {
    expect(parseMapsInput('https://www.google.com/maps/place/' + 'a'.repeat(2000))).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('links', () => {
  it('prefers coordinates, falls back to the stored url, else null', () => {
    expect(mapsLinkFor({ locationLat: 24.7, locationLng: 46.7, locationUrl: 'https://maps.app.goo.gl/x' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=24.7,46.7');
    expect(mapsLinkFor({ locationUrl: 'https://maps.app.goo.gl/x' })).toBe('https://maps.app.goo.gl/x');
    expect(mapsLinkFor({})).toBeNull();
    expect(hasLocation({})).toBe(false);
  });

  it('never returns a stored url that is not an allowed Maps link', () => {
    expect(mapsLinkFor({ locationUrl: 'https://evil.example/x' })).toBeNull();
    expect(mapsLinkFor({ locationUrl: 'http://maps.google.com/?q=1,2' })).toBeNull();
  });

  it('builds directions only with coordinates', () => {
    expect(directionsLinkFor({ locationLat: -1.5, locationLng: 36.8 }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=-1.5,36.8');
    expect(directionsLinkFor({ locationUrl: 'https://maps.app.goo.gl/x' })).toBeNull();
  });

  it('ignores half-set or out-of-range coordinates', () => {
    expect(mapsLinkFor({ locationLat: 24.7, locationLng: null })).toBeNull();
    expect(directionsLinkFor({ locationLat: 99, locationLng: 10 })).toBeNull();
  });
});
