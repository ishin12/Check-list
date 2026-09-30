import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { features } from '@/config/features';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { getWorkDays, saveProjectType, saveStage, saveWorkDays } from '@/services/data/fieldOps';
import type { ConfigText, ProjectStage, ProjectType } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { weekdayName } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Configuration over code (§25): project types, new-project stages and
 * working days are managed here; checklists and their frequencies live under
 * Checklists. Nothing here is deleted — items are deactivated.
 */
export function ConfigScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [workDays, setWorkDays] = useState<number[]>([]);
  const [editType, setEditType] = useState<Partial<ProjectType> | null>(null);
  const [editStage, setEditStage] = useState<Partial<ProjectStage> | null>(null);

  useEffect(() => { void getWorkDays().then(setWorkDays).catch((e) => setError(friendlyError(e, t))); }, [t]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(null); setMsg(null);
    try { await fn(); await fd.refresh(); if (done) setMsg(done); } catch (e) { setError(friendlyError(e, t)); }
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
                const name = editType.name ?? {};
                await saveProjectType({ id: editType.id, code: editType.code ?? codeOf(name), name, usesStages: !!editType.usesStages, sortOrder: editType.sortOrder ?? 99, active: editType.active !== false });
                setEditType(null);
              }, t('fo.saved', 'Saved.') ?? '')}
            />
          ) : null}
          {fd.types.map((ty) => (
            <div key={ty.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{configText(ty.name, language)}</div>
                <div className="card__meta">{[ty.name.en, ty.name.ar, ty.name.ur].filter(Boolean).join(' · ')}{ty.usesStages ? ` · ${t('fo.config.stagesOn', 'stages')}` : ''}</div>
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
                    const name = editStage.name ?? {};
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
          <button type="button" className="btn btn--primary" onClick={() => void run(() => saveWorkDays(workDays), t('fo.saved', 'Saved.') ?? '')}>{t('common.save', 'Save')}</button>
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
        <button type="button" className="btn btn--primary" disabled={!value.en?.trim() && !value.ar?.trim()} onClick={onSave}>{t('common.save', 'Save')}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
      </div>
    </div>
  );
}
