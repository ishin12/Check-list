import { describe, expect, it } from 'vitest';
import {
  clearSelection, filterWorkers, selectAllVisible, summarizeNames, toggleWorker,
} from '../workerSelect';

const opts = [
  { id: '1', label: 'Ali Hassan' },
  { id: '2', label: 'Bilal Khan' },
  { id: '3', label: 'Alia Noor' },
];

describe('worker multi-select logic', () => {
  it('filters by name, case-insensitively', () => {
    expect(filterWorkers(opts, 'ali').map((o) => o.id)).toEqual(['1', '3']);
    expect(filterWorkers(opts, '  BILAL ').map((o) => o.id)).toEqual(['2']);
    expect(filterWorkers(opts, '')).toEqual(opts);
    expect(filterWorkers(opts, 'zzz')).toEqual([]);
  });

  it('select all only adds the visible workers and keeps hidden selections', () => {
    const visible = filterWorkers(opts, 'ali');
    expect(selectAllVisible(['2'], visible)).toEqual(['2', '1', '3']);
    expect(selectAllVisible(['1'], visible)).toEqual(['1', '3']);
  });

  it('toggles and clears', () => {
    expect(toggleWorker(['1'], '2')).toEqual(['1', '2']);
    expect(toggleWorker(['1', '2'], '1')).toEqual(['2']);
    expect(clearSelection()).toEqual([]);
  });

  it('summarises names with an overflow count', () => {
    expect(summarizeNames(['Ali', 'Bilal', 'Sara'])).toEqual({ shown: ['Ali', 'Bilal'], extra: 1 });
    expect(summarizeNames(['Ali'])).toEqual({ shown: ['Ali'], extra: 0 });
  });
});
