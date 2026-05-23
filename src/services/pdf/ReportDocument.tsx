import { forwardRef } from 'react';
import type { Job, Language } from '@/domain/models/types';
import { templateTitle, taskLabel } from '@/domain/template/template';
import { formatDateTime } from '@/lib/datetime';
import { countChecked } from '@/domain/job/job';

export interface ReportLabels {
  reportTitle: string;
  date: string;
  customer: string;
  tasksDone: (done: number, total: number) => string;
  signature: string;
  signedBy: string;
  completed: string;
  notCompleted: string;
}

interface Props {
  job: Job;
  language: Language;
  labels: ReportLabels;
}

/**
 * A4-proportioned printable report. Uses inline styles only (no app CSS) so the
 * html-to-image rasterizer renders it identically regardless of app theme.
 * Rendered offscreen, then captured into a PDF.
 */
export const ReportDocument = forwardRef<HTMLDivElement, Props>(
  ({ job, language, labels }, ref) => {
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    const fontFamily =
      language === 'ar'
        ? "'Cairo', system-ui, sans-serif"
        : "'Inter', system-ui, sans-serif";
    const tasks = job.templateSnapshot.tasks;
    const resultFor = (taskId: string) =>
      job.results.find((r) => r.taskId === taskId);
    const done = countChecked(job.results);

    return (
      <div
        ref={ref}
        dir={dir}
        style={{
          width: 794,
          minHeight: 1123,
          background: '#ffffff',
          color: '#0f172a',
          fontFamily,
          padding: 48,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            borderBottom: '3px solid #0ea5e9',
            paddingBottom: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            {templateTitle(job.templateSnapshot, language)}
          </div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            {labels.reportTitle}
          </div>
        </div>

        <table style={{ width: '100%', fontSize: 14, marginBottom: 24 }}>
          <tbody>
            <tr>
              <td style={{ color: '#64748b', padding: '4px 0', width: 140 }}>
                {labels.date}
              </td>
              <td style={{ fontWeight: 600 }}>
                {formatDateTime(job.completedAt ?? job.createdAt, language)}
              </td>
            </tr>
            {job.customer?.name ? (
              <tr>
                <td style={{ color: '#64748b', padding: '4px 0' }}>
                  {labels.customer}
                </td>
                <td style={{ fontWeight: 600 }}>{job.customer.name}</td>
              </tr>
            ) : null}
            {job.customer?.phone ? (
              <tr>
                <td style={{ color: '#64748b', padding: '4px 0' }} />
                <td style={{ fontWeight: 600 }}>{job.customer.phone}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#0284c7',
            marginBottom: 12,
          }}
        >
          {labels.tasksDone(done, tasks.length)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map((task) => {
            const result = resultFor(task.id);
            const checked = !!result?.checked;
            return (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  background: checked ? '#f0fdf4' : '#ffffff',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    flexShrink: 0,
                    background: checked ? '#16a34a' : '#ffffff',
                    border: `2px solid ${checked ? '#16a34a' : '#cbd5e1'}`,
                    color: '#ffffff',
                    fontSize: 14,
                    lineHeight: '20px',
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  {checked ? '✓' : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>
                    {taskLabel(task, language)}
                  </div>
                  {result?.note ? (
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {result.note}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 40 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#0284c7',
              marginBottom: 8,
            }}
          >
            {labels.signature}
          </div>
          {job.signature ? (
            <div>
              <img
                src={job.signature.dataUrl}
                alt="signature"
                style={{
                  maxWidth: 300,
                  maxHeight: 140,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#ffffff',
                }}
              />
              {job.signature.signerName ? (
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                  {labels.signedBy}: {job.signature.signerName}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: '#94a3b8' }}>—</div>
          )}
        </div>
      </div>
    );
  },
);

ReportDocument.displayName = 'ReportDocument';
