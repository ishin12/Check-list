import { describe, expect, it } from 'vitest';
import { clientLocationForSelection } from '../clientLocation';

describe('clientLocationForSelection', () => {
  it('returns the selected client coordinates for the job map preview', () => {
    expect(clientLocationForSelection([
      { id: 'client-1', location: { locationLat: 24.7792223, locationLng: 46.3968794 } },
    ], 'client-1')).toEqual({ locationLat: 24.7792223, locationLng: 46.3968794 });
  });
});
