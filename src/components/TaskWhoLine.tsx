import { Link } from 'react-router-dom';
import { useClientName, useWorkerName } from '@/app/providers/DirectoryContext';
import { useAuth } from '@/app/providers/AuthContext';
import type { FieldTask } from '@/domain/models/ops';

interface Props {
  task: Pick<FieldTask, 'assignedWorkerId' | 'clientId'>;
  /** When true, only the client name is shown (worker view). */
  hideWorker?: boolean;
  /** When true, only the worker name is shown (client portal). */
  hideClient?: boolean;
  /** When true, render the client name as a link to /clients/:id (manager only). */
  linkClient?: boolean;
}

/** Compact "Worker · Client" line shown beneath a task title. */
export function TaskWhoLine({ task, hideWorker, hideClient, linkClient }: Props) {
  const workerName = useWorkerName(task.assignedWorkerId);
  const clientName = useClientName(task.clientId);
  const { user } = useAuth();

  const parts: React.ReactNode[] = [];
  if (!hideWorker) parts.push(<span key="w">{workerName}</span>);
  if (!hideClient) {
    parts.push(
      linkClient && user?.role === 'manager' ? (
        <Link
          key="c"
          to={`/clients/${task.clientId}`}
          className="who-line__link"
          onClick={(e) => e.stopPropagation()}
        >
          {clientName}
        </Link>
      ) : (
        <span key="c">{clientName}</span>
      ),
    );
  }
  if (parts.length === 0) return null;

  return (
    <div className="card__meta who-line">
      {parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={`sep${i}`} className="who-line__sep">·</span>, p]))}
    </div>
  );
}
