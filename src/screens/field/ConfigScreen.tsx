import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { features } from '@/config/features';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { getWorkDays, saveProjectType, saveStage, saveTarget, saveWorkDays, saveWorkType } from '@/services/data/fieldOps';
import type { ConfigText, OperationalTarget, ProjectStage, ProjectType, WorkType } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { weekdayName } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Configuration over code (§25): project types, new-project stages, work
 * types, operational targets (v2.2) and working days are managed here; checklists and their frequencies live under
 * Checklists. Nothing here is deleted — items are deactivated.
 */
export function ConfigScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [workDays, setWorkDays] = useState<number[]>([]);
  const [savedDays, setSavedDays] = useState<number[]>([]);
  const [editType, setEditType] = useState<Partial<ProjectType> | null>(null);
  const [editStage, setEditStage] = useState<Partial<ProjectStage> | null>(null);

  useEffect(() => { void getWorkDays().then((d) => { setWorkDays(d); setSavedDays(d); }).catch((e) => setError(friendlyError(e, t))); }, [t]);

  async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setError(null); setMsg(null);
    try { await fn(); await fd.refresh(); if (done) setMsg(done); return true; } catch (e) { setError(friendlyError(e, t)); return false; }
  }

  const codeOf = (name: ConfigText) => (name.en || name.ar || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `item_${Date.now()}`;

  return (
    <AppShell>
      <AppHeader title={t('fo.config.title', 'Setup')} showBack />
      <main className="app-main">
        <ErrorBanner message={error} />
        {msg ? <div className="banner banner--success">{msg}</div> : null}

        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn btn--ghost" to="/templates">☑ {t('fo.config.checklists', 'Checklists & frequencies')}</Link>
          <Link className="btn btn--ghost" to="/employees">☺ {t('fo.emp.title', 'Workers')}</Link>
          <Link className="btn btn--ghost" to="/users">{features.legacyTasks ? t('users.title', 'Team & clients') : t('users.teamTitle', 'Team')}</Link>
        </div>

        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="card__title">{t('fo.config.types', 'Project types')}</div>
            <button type="button" className="btn btn--ghost" onClick={() => setEditType({ name: {}, usesStages: false, active: true, sortOrder: fd.types.length + 1 })}>＋ {t('fo.add', 'Add')}</button>
          </div>
          {editType ? (
            <NameEditor
              value={editType.name ?? {}}
              onChange={(name) => setEditType({ ...editType, name })}
              extra={<label className="checkbox-row"><input type="checkbox" checked={!!editType.usesStages} onChange={(e) => setEditType({ ...editType, usesStages: e.target.checked })} />{t('fo.config.usesStages', 'Uses stages (new projects)')}</label>}
              onCancel={() => setEditType(null)}
              onSave={() => void run(async () => {
                const name = trimName(editType.name ?? {});
                await saveProjectType({ id: editType.id, code: editType.code ?? codeOf(name), name, usesStages: !!editType.usesStages, sortOrder: editType.sortOrder ?? 99, active: editType.active !== false });
                setEditType(null);
              }, t('fo.saved', 'Saved.') ?? '')}
            />
          ) : null}
          {fd.types.map((ty) => (
            <div key={ty.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{configText(ty.name, language)}</div>
                <div className="card__meta">{[ty.name.en, ty.name.ar, ty.name.ur].filter(Boolean).map((v, i) => <span key={i}>{i ? ' · ' : ''}<bdi>{v}</bdi></span>)}{ty.usesStages ? ` · ${t('fo.config.stagesOn', 'stages')}` : ''}</div>
              </div>
              {!ty.active ? <FieldStatusPill status="inactive" /> : null}
              <button type="button" className="btn btn--ghost" onClick={() => setEditType(ty)}>{t('common.edit', 'Edit')}</button>
              <button type="button" className="btn btn--ghost" onClick={() => void run(() => saveProjectType({ ...ty, active: !ty.active }))}>
                {ty.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
              </button>
            </div>
          ))}
        </section>

        {fd.types.filter((ty) => ty.usesStages).map((ty) => {
          const stages = fd.stages.filter((s) => s.projectTypeId === ty.id).sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <section key={ty.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="card__title">{t('fo.config.stagesOf', 'Stages — {{type}}', { type: configText(ty.name, language) })}</div>
                <button type="button" className="btn btn--ghost" onClick={() => setEditStage({ projectTypeId: ty.id, name: {}, active: true, sortOrder: stages.length + 1 })}>＋ {t('fo.add', 'Add')}</button>
              </div>
              {editStage && editStage.projectTypeId === ty.id ? (
                <NameEditor
                  value={editStage.name ?? {}}
                  onChange={(name) => setEditStage({ ...editStage, name })}
                  extra={<div className="field"><label className="field__label">{t('fo.config.order', 'Order')}</label>
                    <input className="input" type="number" min={1} value={editStage.sortOrder ?? 1} onChange={(e) => setEditStage({ ...editStage, sortOrder: Number(e.target.value) })} /></div>}
                  onCancel={() => setEditStage(null)}
                  onSave={() => void run(async () => {
                    const name = trimName(editStage.name ?? {});
                    await saveStage({ id: editStage.id, projectTypeId: ty.id, code: editStage.code ?? codeOf(name), name, sortOrder: editStage.sortOrder ?? 99, active: editStage.active !== false });
                    setEditStage(null);
                  }, t('fo.saved', 'Saved.') ?? '')}
                />
              ) : null}
              {stages.map((s) => (
                <div key={s.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                  <div className="grow"><span style={{ fontWeight: 700 }}>{s.sortOrder}. {configText(s.name, language)}</span></div>
                  {!s.active ? <FieldStatusPill status="inactive" /> : null}
                  <button type="button" className="btn btn--ghost" onClick={() => setEditStage(s)}>{t('common.edit', 'Edit')}</button>
                  <button type="button" className="btn btn--ghost" onClick={() => void run(() => saveStage({ ...s, active: !s.active }))}>
                    {s.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
                  </button>
                </div>
              ))}
            </section>
          );
        })}

        <ManagedList<WorkType>
          title={t('fo.wt.title', 'Work types')}
          hint={t('fo.wt.hint', 'Chosen once per visit and applied to its workers. Shown in labor reports and Excel.')}
          items={fd.workTypes}
          codeOf={codeOf}
          onSave={(x) => run(() => saveWorkType(x), t('fo.saved', 'Saved.') ?? '')}
        />
        <ManagedList<OperationalTarget>
          title={t('fo.ot.title', 'Operational targets')}
          hint={t('fo.ot.hint', 'Where a worker’s day goes when it is not a project (warehouse, office, leave…). No made-up projects.')}
          items={fd.targets}
          codeOf={codeOf}
          onSave={(x) => run(() => saveTarget(x), t('fo.saved', 'Saved.') ?? '')}
        />

        <section className="card stack">
          <div className="card__title">{t('fo.config.workDays', 'Working days')}</div>
          <div className="card__meta">{t('fo.config.workDaysHint', 'Used for the "not allocated" list and report.')}</div>
          <div className="weekdays">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <button key={d} type="button" aria-pressed={workDays.includes(d)} className={`chip${workDays.includes(d) ? ' chip--active' : ''}`}
                onClick={() => setWorkDays(workDays.includes(d) ? workDays.filter((x) => x !== d) : [...workDays, d])}>
                {weekdayName(d, language)}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--primary" onClick={() => void run(async () => {
            // Nothing changed: no save, no empty audit entry.
            if ([...workDays].sort().join() === [...savedDays].sort().join()) return;
            await saveWorkDays(workDays); setSavedDays(workDays);
          }, t('fo.saved', 'Saved.') ?? '')}>{t('common.save', 'Save')}</button>
        </section>
      </main>
    </AppShell>
  );
}

function NameEditor({ value, onChange, extra, onSave, onCancel }: {
  value: ConfigText; onChange: (v: ConfigText) => void; extra?: React.ReactNode; onSave: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="stack" style={{ background: 'var(--color-surface-2)', padding: 12, borderRadius: 12 }}>
      <div className="field"><label className="field__label">{t('fo.config.nameEn', 'Name (English)')}</label>
        <input className="input" value={value.en ?? ''} onChange={(e) => onChange({ ...value, en: e.target.value })} /></div>
      <div className="field"><label className="field__label">{t('fo.config.nameAr', 'Name (Arabic)')}</label>
        <input className="input" dir="rtl" value={value.ar ?? ''} onChange={(e) => onChange({ ...value, ar: e.target.value })} /></div>
      <div className="field"><label className="field__label">{t('fo.config.nameUr', 'Name (Urdu, optional)')}</label>
        <input className="input" dir="rtl" lang="ur" value={value.ur ?? ''} onChange={(e) => onChange({ ...value, ur: e.target.value })} /></div>
      {extra}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary" disabled={!value.en?.trim() || !value.ar?.trim()} onClick={onSave}>{t('common.save', 'Save')}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
      </div>
    </div>
  );
}

/** A managed list (work types, operational targets): add, rename, reorder, switch off — never delete. */
function ManagedList<T extends { id: string; code: string; name: ConfigText; sortOrder: number; active: boolean }>({ title, hint, items, codeOf, onSave }: {
  title: string; hint: string; items: T[]; codeOf: (name: ConfigText) => string;
  onSave: (x: { id?: string; code: string; name: ConfigText; sortOrder: number; active: boolean }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [edit, setEdit] = useState<Partial<T> | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  const same = (a?: string, b?: string) => !!a?.trim() && a.trim().toLowerCase() === b?.trim().toLowerCase();
  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="card__title">{title}</div>
        <button type="button" className="btn btn--ghost" onClick={() => setEdit({ name: {}, active: true, sortOrder: items.length + 1 } as Partial<T>)}>＋ {t('fo.add', 'Add')}</button>
      </div>
      <div className="card__meta">{hint}</div>
      {edit ? (
        <NameEditor
          value={edit.name ?? {}}
          onChange={(name) => setEdit({ ...edit, name })}
          extra={<div className="field"><label className="field__label">{t('fo.config.order', 'Order')}</label>
            <input className="input" type="number" min={1} value={edit.sortOrder ?? 1} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} /></div>}
          onCancel={() => { setEdit(null); setDupError(null); }}
          onSave={() => {
            const raw = (edit.name ?? {}) as ConfigText;
            // Names are stored trimmed (no invisible trailing spaces, no fake changes).
            const name: ConfigText = { en: raw.en?.trim() || undefined, ar: raw.ar?.trim() || undefined, ...(raw.ur?.trim() ? { ur: raw.ur.trim() } : {}) };
            // One entry per name: entries are never deleted, so a duplicate would stay forever (UAT v2.2).
            const dup = items.find((x) => x.id !== edit.id && (same(x.name.en, name.en) || same(x.name.ar, name.ar)));
            if (dup) { setDupError(t('fo.config.duplicate', '“{{name}}” already exists. Edit or reactivate it instead.', { name: configText(dup.name, language) })); return; }
            setDupError(null);
            // Nothing changed: close without a save (and without an empty audit entry).
            const before = items.find((x) => x.id === edit.id);
            if (before && JSON.stringify(before.name) === JSON.stringify(name) && before.sortOrder === (edit.sortOrder ?? 99)) { setEdit(null); return; }
            const code = edit.code ?? `${codeOf(name)}_${Date.now().toString(36)}`;
            void onSave({ id: edit.id, code, name, sortOrder: edit.sortOrder ?? 99, active: edit.active !== false }).then((ok) => { if (ok) setEdit(null); });
          }}
        />
      ) : null}
      <ErrorBanner message={dupError} />
      {[...items].sort((a, b) => a.sortOrder - b.sortOrder).map((x) => (
        <div key={x.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{configText(x.name, language)}</div>
            <div className="card__meta">{[x.name.en, x.name.ar, x.name.ur].filter(Boolean).map((v, i) => <span key={i}>{i ? ' · ' : ''}<bdi>{v}</bdi></span>)}</div>
          </div>
          {!x.active ? <FieldStatusPill status="inactive" /> : null}
          <button type="button" className="btn btn--ghost" onClick={() => { setEdit(x); setDupError(null); }}>{t('common.edit', 'Edit')}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void onSave({ ...x, active: !x.active })}>
            {x.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
          </button>
        </div>
      ))}
    </section>
  );
}

function trimName(raw: ConfigText): ConfigText {
  return { en: raw.en?.trim() || undefined, ar: raw.ar?.trim() || undefined, ...(raw.ur?.trim() ? { ur: raw.ur.trim() } : {}) };
}
