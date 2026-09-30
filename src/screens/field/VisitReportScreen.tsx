import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { getReportForVisit, getVisit, updateReport } from '@/services/data/fieldOps';
import { generateReportContent } from '@/services/data/visitFlow';
import { getProofUrl } from '@/services/media/proofUrls';
import { HtmlRasterPdfGenerator } from '@/services/pdf/HtmlRasterPdfGenerator';
import { VisitReportDocument, type VisitReportLabels } from '@/services/pdf/VisitReportDocument';
import { shareFile, type ShareOutcome } from '@/services/share/ShareService';
import type { VisitReportContent } from '@/domain/models/ops';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames } from './common';

const WIDTH = 794;
const pdf = new HtmlRasterPdfGenerator();

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * §12: the client visit report, generated from recorded data (BR-013). A
 * completed visit shows the content frozen at completion; an open visit shows
 * a live draft. The PDF has a place for the client representative's name and
 * signature (§36 Q2 is open, so no in-app e-signature is assumed).
 */
export function VisitReportScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const fd = useFieldData();
  const names = useNames();

  const { data, error, reload } = useAsync(async () => {
    const visit = id ? await getVisit(id) : null;
    if (!visit) return null;
    const project = fd.project(visit.projectId);
    const report = await getReportForVisit(visit.id);
    // The issued content is frozen; the client representative lives in signer_name.
    let content: VisitReportContent | undefined = report?.content
      ? { ...report.content, clientRepName: report.signerName ?? report.content.clientRepName }
      : undefined;
    if (!content) {
      content = await generateReportContent(visit, {
        projectName: project?.name ?? '—', projectCode: project?.code, clientName: names.client(project?.clientId),
        supervisorName: names.person(visit.supervisorId), employeeName: names.employee, taskLabel: names.taskLabel,
      }, report?.reportNumber, report?.signerName);
    }
    const paths = [...content.done, ...content.followUp].flatMap((l) => l.photos.map((p) => p.storagePath));
    const images = new Map<string, string>();
    await Promise.all(paths.map(async (path) => {
      const url = await getProofUrl(path);
      const data = url ? await toDataUrl(url) : null;
      if (data) images.set(path, data);
    }));
    return { visit, report, content, images };
  }, [id, fd.ready]);

  const docRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [building, setBuilding] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [rep, setRep] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { setRep(data?.content.clientRepName ?? ''); }, [data?.content.clientRepName]);

  const [docHeight, setDocHeight] = useState(1123);
  useLayoutEffect(() => {
    const measure = () => {
      if (boxRef.current) setScale(Math.min(1, boxRef.current.clientWidth / WIDTH));
      if (docRef.current) setDocHeight(docRef.current.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [data]);

  const build = useCallback(async () => {
    if (!docRef.current || !data) return;
    setBuilding(true);
    try {
      const no = data.report?.reportNumber ? String(data.report.reportNumber).padStart(5, '0') : data.visit.id.slice(0, 8);
      setFile(await pdf.generateFromNode(docRef.current, `visit-report-${no}.pdf`));
    } finally {
      setBuilding(false);
    }
  }, [data]);

  // Pre-build so Share can run inside the tap (iOS keeps the gesture).
  useEffect(() => { setFile(null); if (data) void build(); }, [data, language, build]);

  async function saveRep() {
    if (!data?.report || rep === (data.content.clientRepName ?? '')) return;
    setSaveError(null);
    try {
      await updateReport(data.report.id, { signerName: rep });
      await reload();
    } catch (e) {
      setSaveError(friendlyError(e, t));
    }
  }

  const labels: VisitReportLabels = {
    title: t('fo.report.title', 'Visit report'),
    reportNo: t('fo.report.number', 'Report no.'),
    client: t('fo.report.client', 'Client'),
    project: t('fo.report.project', 'Project / site'),
    date: t('fo.report.date', 'Visit date'),
    supervisor: t('fo.report.supervisor', 'Supervisor'),
    required: t('fo.report.required', 'Work required'),
    done: t('fo.report.done', 'Work done'),
    followUp: t('fo.report.followUp', 'Follow-up / next visit'),
    none: t('fo.report.none', 'None'),
    crew: t('fo.report.crew', 'Crew'),
    days: t('fo.days', 'day(s)'),
    statusDone: t('fo.answer.done', 'Done'),
    statusFollowUp: t('fo.status.needs_follow_up', 'Follow-up'),
    statusNotDone: t('fo.answer.not_done', 'Not done'),
    before: t('fo.photo.before', 'Before'),
    after: t('fo.photo.after', 'After'),
    clientRep: t('fo.report.clientRep', 'Client representative'),
    signature: t('fo.report.signature', 'Signature'),
    approval: t('fo.report.approval', 'approval'),
    generated: t('fo.report.generated', 'Generated automatically from the recorded visit.'),
    riyadhTime: t('fo.report.riyadhTime', 'Riyadh time'),
  };

  const banner = outcome === 'shared' ? { cls: 'banner--success', msg: t('report.shared', 'Shared successfully.') }
    : outcome === 'downloaded' ? { cls: 'banner--info', msg: t('report.downloaded', 'PDF downloaded.') }
      : outcome === 'error' ? { cls: 'banner--error', msg: t('report.shareError', "Couldn't share. The PDF was downloaded instead.") } : null;

  return (
    <AppShell>
      <AppHeader title={t('fo.report.title', 'Visit report')} showBack />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}
        {!data ? <p className="hint">{t('common.loading', 'Loading…')}</p> : (
          <>
            {data.visit.status !== 'completed' ? (
              <div className="banner banner--info">{t('fo.report.draft', 'Draft — the visit is not completed yet.')}</div>
            ) : null}
            {banner ? <div className={`banner ${banner.cls}`}>{banner.msg}</div> : null}

            {data.report ? (
              <div className="field">
                <label className="field__label" htmlFor="rep">{t('fo.report.clientRep', 'Client representative')}</label>
                <input id="rep" className="input" value={rep} onChange={(e) => setRep(e.target.value)} onBlur={() => void saveRep()}
                  placeholder={t('fo.report.repPlaceholder', 'Name of the person receiving the visit') ?? ''} />
                {saveError ? <div className="banner banner--error">{saveError}</div> : null}
              </div>
            ) : null}

            <div ref={boxRef} className="report-frame">
              <div style={{ width: WIDTH * scale, height: docHeight * scale, overflow: 'hidden' }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: language === 'en' ? 'top left' : 'top right', width: WIDTH }}>
                  <VisitReportDocument ref={docRef} content={data.content} language={language} labels={labels} images={data.images} />
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      {data ? (
        <div className="action-bar">
          <button type="button" className="btn btn--success btn--lg btn--block" disabled={building || !file}
            onClick={async () => { if (file) setOutcome((await shareFile(file, { title: labels.title, text: data.content.projectName })).outcome); }}>
            {building || !file ? t('report.generating', 'Preparing PDF…') : `📤 ${t('fo.report.share', 'Share PDF')}`}
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
