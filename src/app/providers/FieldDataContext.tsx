import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  listEmployees,
  listFieldTemplates,
  listProjects,
  listProjectTypes,
  listStages,
  listTargets,
  listWorkTypes,
} from '@/services/data/fieldOps';
import type { Employee, OperationalTarget, Project, ProjectStage, ProjectType, WorkType } from '@/domain/models/ops';
import type { Template } from '@/domain/models/types';
import { errorText } from '@/lib/useAsync';

/**
 * Reference data the field screens share: project types, stages, the projects
 * the user can see, crew and checklist templates. RLS decides what "can see"
 * means per role; screens call refresh() after changing any of these.
 */
interface FieldData {
  types: ProjectType[];
  stages: ProjectStage[];
  projects: Project[];
  employees: Employee[];
  templates: (Template & { active: boolean })[];
  workTypes: WorkType[];
  targets: OperationalTarget[];
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  project: (id: string | undefined) => Project | undefined;
  employee: (id: string | undefined) => Employee | undefined;
  type: (id: string | undefined) => ProjectType | undefined;
  stage: (id: string | undefined) => ProjectStage | undefined;
  workType: (id: string | undefined) => WorkType | undefined;
  target: (id: string | undefined) => OperationalTarget | undefined;
}

const Ctx = createContext<FieldData | null>(null);

export function FieldDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<(Template & { active: boolean })[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [targets, setTargets] = useState<OperationalTarget[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ty, st, pr, em, tp, wt, ot] = await Promise.all([
        listProjectTypes(), listStages(), listProjects(), listEmployees(), listFieldTemplates(), listWorkTypes(), listTargets(),
      ]);
      setTypes(ty); setStages(st); setProjects(pr); setEmployees(em); setTemplates(tp); setWorkTypes(wt); setTargets(ot);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role === 'client') { setReady(false); return; }
    void refresh();
  }, [user, refresh]);

  const value = useMemo<FieldData>(() => {
    const byId = <T extends { id: string }>(list: T[]) => {
      const m = new Map(list.map((x) => [x.id, x]));
      return (id: string | undefined) => (id ? m.get(id) : undefined);
    };
    return {
      types, stages, projects, employees, templates, workTypes, targets, ready, error, refresh,
      project: byId(projects), employee: byId(employees), type: byId(types), stage: byId(stages),
      workType: byId(workTypes), target: byId(targets),
    };
  }, [types, stages, projects, employees, templates, workTypes, targets, ready, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFieldData(): FieldData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFieldData must be used inside <FieldDataProvider>');
  return v;
}
