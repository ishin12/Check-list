/** Pure helpers behind WorkerMultiSelect (kept separate so they are unit-testable). */

export interface WorkerOption {
  id: string;
  label: string;
}

/** Case-insensitive substring match on the label; blank query returns everything. */
export function filterWorkers(options: WorkerOption[], query: string): WorkerOption[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return options;
  return options.filter((o) => o.label.toLocaleLowerCase().includes(q));
}

/** Adds every currently visible option to the selection (hidden selections are kept). */
export function selectAllVisible(selected: string[], visible: WorkerOption[]): string[] {
  const next = [...selected];
  for (const o of visible) if (!next.includes(o.id)) next.push(o.id);
  return next;
}

export function toggleWorker(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export function clearSelection(): string[] {
  return [];
}

/** "Ali, Bilal +1": the first `max` names then a +N overflow count. */
export function summarizeNames(names: string[], max = 2): { shown: string[]; extra: number } {
  return { shown: names.slice(0, max), extra: Math.max(0, names.length - max) };
}
