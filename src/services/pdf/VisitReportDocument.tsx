import { forwardRef } from 'react';
import type { VisitReportContent, VisitReportTaskLine } from '@/domain/models/ops';
import type { Language } from '@/domain/models/types';
import { formatDate, formatDateTime } from '@/lib/dates';

export interface VisitReportLabels {
  title: string;
  reportNo: string;
  client: string;
  project: string;
  date: string;
  supervisor: string;
  required: string;
  done: string;
  followUp: string;
  none: string;
  crew: string;
  notes: string;
  days: string;
  statusDone: string;
  statusFollowUp: string;
  statusNotDone: string;
  before: string;
  after: string;
  clientRep: string;
  signature: string;
  approval: string;
  generated: string;
  /** "Riyadh time" suffix for the completion time. */
  riyadhTime: string;
}

interface Props {
  content: VisitReportContent;
  language: Language;
  labels: VisitReportLabels;
  /** storagePath → data URL, resolved before capture so images embed in the PDF. */
  images: Map<string, string>;
}

const INK = '#003C1B';
const MUTED = '#4a6357';
const LINE = '#dde2d8';
const BRAND = '#00A66E';

/**
 * A4 visit report generated from the recorded visit (§12, BR-013). Inline
 * styles only so the rasterized PDF looks the same regardless of app theme.
 */
export const VisitReportDocument = forwardRef<HTMLDivElement, Props>(({ content, language, labels, images }, ref) => {
  const dir = language === 'en' ? 'ltr' : 'rtl';
  const fontFamily = language === 'ur'
    ? "'Noto Naskh Arabic', 'Cairo', system-ui, sans-serif"
    : language === 'ar' ? "'Cairo', system-ui, sans-serif" : "'Inter', system-ui, sans-serif";

  const statusText = (l: VisitReportTaskLine) =>
    l.status === 'completed' ? labels.statusDone : l.status === 'needs_follow_up' ? labels.statusFollowUp : labels.statusNotDone;
  const statusColor = (l: VisitReportTaskLine) =>
    l.status === 'completed' ? BRAND : l.status === 'needs_follow_up' ? '#C06A12' : MUTED;

  const section = (title: string) => (
    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: MUTED, margin: '22px 0 8px' }}>{title}</div>
  );

  const meta: [string, string][] = [
    [labels.client, content.clientName],
    [labels.project, content.projectCode ? `${content.projectName} (${content.projectCode})` : content.projectName],
    [labels.date, formatDate(content.visitDate, language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
    [labels.supervisor, content.supervisorName],
  ];

  return (
    <div ref={ref} dir={dir} style={{ width: 794, minHeight: 1123, background: '#fff', color: INK, fontFamily, padding: 48, boxSizing: 'border-box', fontSize: 14, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${BRAND}`, paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND }}>Ghsoon Najd · غصون نجد</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{labels.title}</div>
        </div>
        {content.reportNumber ? (
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: 12, color: MUTED }}>{labels.reportNo}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>#{String(content.reportNumber).padStart(5, '0')}</div>
          </div>
        ) : null}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <tbody>
          {meta.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '4px 0', color: MUTED, width: 140, fontWeight: 600 }}>{k}</td>
              <td style={{ padding: '4px 0', fontWeight: 700 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {section(`${labels.required} (${content.required.length})`)}
      {content.required.length === 0 ? <div style={{ color: MUTED }}>{labels.none}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {content.required.map((l) => (
              <tr key={l.taskId} style={{ borderBottom: `1px solid ${LINE}` }}>
                <td style={{ padding: '7px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 600 }}>{l.description}</div>
                  {l.note ? <div style={{ color: MUTED, fontSize: 12.5 }}>{l.note}</div> : null}
                </td>
                <td style={{ padding: '7px 0', textAlign: 'end', verticalAlign: 'top', whiteSpace: 'nowrap', fontWeight: 700, color: statusColor(l) }}>
                  {statusText(l)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section(`${labels.done} (${content.done.length})`)}
      {content.done.length === 0 ? <div style={{ color: MUTED }}>{labels.none}</div> : content.done.map((l) => (
        <div key={l.taskId} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>✓ {l.description}</div>
          {l.photos.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {l.photos.map((p) => images.get(p.storagePath) ? (
                <div key={p.id} style={{ width: 150 }}>
                  <img src={images.get(p.storagePath)} alt="" style={{ width: 150, height: 112, objectFit: 'cover', borderRadius: 6, border: `1px solid ${LINE}` }} />
                  {p.kind ? <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{p.kind === 'before' ? labels.before : labels.after}</div> : null}
                </div>
              ) : null)}
            </div>
          ) : null}
        </div>
      ))}

      {section(`${labels.followUp} (${content.followUp.length})`)}
      {content.followUp.length === 0 ? <div style={{ color: MUTED }}>{labels.none}</div> : (
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {content.followUp.map((l) => (
            <li key={l.taskId} style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{l.description}</span>
              <span style={{ color: statusColor(l), fontWeight: 700 }}> — {statusText(l)}</span>
              {l.note ? <span style={{ color: MUTED }}> · {l.note}</span> : null}
              {l.photos.length ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {l.photos.map((p) => images.get(p.storagePath)
                    ? <img key={p.id} src={images.get(p.storagePath)} alt="" style={{ width: 90, height: 68, objectFit: 'cover', borderRadius: 4 }} />
                    : null)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {content.crew.length ? (
        <>
          {section(labels.crew)}
          <div style={{ color: INK }}>
            {/* Each worker is isolated so names and numbers keep their order in Arabic (UAT D-41). */}
            {content.crew.map((c, i) => (
              <span key={i}>{i ? ' · ' : ''}<bdi>{c.name}</bdi> (<bdi>{c.duration} {labels.days}</bdi>)</span>
            ))}
          </div>
        </>
      ) : null}

      {content.visitNotes ? (
        <>
          {section(labels.notes)}
          <div style={{ color: INK, whiteSpace: 'pre-wrap' }}>{content.visitNotes}</div>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: MUTED, fontSize: 12, fontWeight: 700 }}>{labels.clientRep}</div>
          <div style={{ borderBottom: `1px solid ${INK}`, minHeight: 60, paddingTop: 6, fontWeight: 700 }}>{content.clientRepName ?? ''}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: MUTED, fontSize: 12, fontWeight: 700 }}>{labels.signature} / {labels.approval}</div>
          <div style={{ borderBottom: `1px solid ${INK}`, minHeight: 60 }} />
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 11, color: MUTED }}>
        {labels.generated}{content.completedAt ? ` · ${formatDateTime(content.completedAt, language)} (${labels.riyadhTime})` : ''}
      </div>
    </div>
  );
});
VisitReportDocument.displayName = 'VisitReportDocument';
