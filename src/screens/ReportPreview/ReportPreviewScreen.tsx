import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { useCurrentJob } from '@/app/providers/CurrentJobContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { ReportDocument, type ReportLabels } from '@/services/pdf/ReportDocument';
import { HtmlRasterPdfGenerator } from '@/services/pdf/HtmlRasterPdfGenerator';
import { shareFile, type ShareOutcome } from '@/services/share/ShareService';
import { completeJob } from '@/domain/job/job';
import { templateTitle } from '@/domain/template/template';

const REPORT_WIDTH = 794;
const pdfGenerator = new HtmlRasterPdfGenerator();

function fileName(job: { id: string }): string {
  return `checklist-${job.id.slice(0, 8)}.pdf`;
}

export function ReportPreviewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { job, setJob } = useCurrentJob();
  const { language } = useLanguage();

  const reportRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pdf, setPdf] = useState<File | null>(null);
  const [building, setBuilding] = useState(true);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  useEffect(() => {
    if (!job) navigate('/', { replace: true });
    else if (job.status !== 'completed') setJob(completeJob(job));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the full-width report into the screen for preview.
  useLayoutEffect(() => {
    const measure = () => {
      const box = previewBoxRef.current;
      if (!box) return;
      setScale(Math.min(1, box.clientWidth / REPORT_WIDTH));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [job]);

  // Pre-generate the PDF so the Share tap can call navigator.share synchronously
  // (avoids losing the user gesture on iOS).
  useEffect(() => {
    let active = true;
    if (!job || !reportRef.current) return;
    setBuilding(true);
    pdfGenerator
      .generateFromNode(reportRef.current, fileName(job))
      .then((file) => {
        if (active) setPdf(file);
      })
      .finally(() => {
        if (active) setBuilding(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, language]);

  const onShare = useCallback(async () => {
    if (!pdf || !job) return;
    const result = await shareFile(pdf, {
      title: templateTitle(job.templateSnapshot, language),
      text: job.customer?.name ?? '',
    });
    setOutcome(result.outcome);
  }, [pdf, job, language]);

  if (!job) return null;

  const labels: ReportLabels = {
    reportTitle: t('report.reportTitle'),
    date: t('report.date'),
    customer: t('report.customer'),
    signature: t('report.signature'),
    signedBy: t('report.signedBy'),
    completed: t('report.completed'),
    notCompleted: t('report.notCompleted'),
    tasksDone: (done, total) => t('report.tasksDone', { done, total }),
  };

  const banner = (() => {
    if (outcome === 'shared') return { cls: 'banner--success', msg: t('report.shared') };
    if (outcome === 'downloaded') return { cls: 'banner--info', msg: t('report.downloaded') };
    if (outcome === 'error') return { cls: 'banner--error', msg: t('report.shareError') };
    return null;
  })();

  return (
    <div className="app-shell">
      <AppHeader title={t('report.title')} showBack />
      <main className="app-main">
        {banner ? <div className={`banner ${banner.cls}`}>{banner.msg}</div> : null}

        <div className="section-title">{t('report.preview')}</div>
        <div
          ref={previewBoxRef}
          style={{
            width: '100%',
            overflow: 'hidden',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div
            style={{
              width: REPORT_WIDTH * scale,
              height: 'auto',
            }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: REPORT_WIDTH,
              }}
            >
              <ReportDocument
                ref={reportRef}
                job={job}
                language={language}
                labels={labels}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => {
            setJob(null);
            navigate('/');
          }}
        >
          {t('report.newJob')}
        </button>
      </main>

      <div className="action-bar">
        <button
          type="button"
          className="btn btn--success btn--block btn--lg"
          disabled={building || !pdf}
          onClick={onShare}
        >
          {building ? t('report.generating') : `📤 ${t('report.share')}`}
        </button>
      </div>
    </div>
  );
}
