import { useCallback, useMemo } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { useDirectory } from '@/app/providers/DirectoryContext';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { can, hasFinance, isSupervisorRole } from '@/domain/auth/permissions';
import { makeTaskLabeler } from '@/services/data/visitFlow';
import type { Project } from '@/domain/models/ops';

export function useRoles() {
  const { user } = useAuth();
  return useMemo(() => ({
    user,
    isManager: user?.role === 'manager' && user.active,
    isSupervisor: !!user && isSupervisorRole(user.role) && user.active,
    isFinance: !!user && hasFinance(user),
    can: (p: Parameters<typeof can>[1]) => can(user, p),
  }), [user]);
}

/** Display names for ids, with safe fallbacks. */
export function useNames() {
  const { workers, clients } = useDirectory();
  const fd = useFieldData();
  const { language } = useLanguage();
  const labeler = useMemo(() => makeTaskLabeler(fd.templates as never, language), [fd.templates, language]);
  return {
    person: useCallback((id?: string) => (id ? workers.get(id)?.fullName ?? workers.get(id)?.email ?? '—' : '—'), [workers]),
    client: useCallback((id?: string) => (id ? clients.get(id)?.name ?? '—' : '—'), [clients]),
    employee: useCallback((id?: string) => (id ? fd.employee(id)?.fullName ?? '—' : '—'), [fd]),
    project: useCallback((id?: string) => (id ? fd.project(id)?.name ?? '—' : '—'), [fd]),
    taskLabel: labeler,
  };
}

/** Projects the user works on day to day: a supervisor's own, everyone's for managers. */
export function useMyProjects(includeClosed = false): Project[] {
  const fd = useFieldData();
  const { user, isManager } = useRoles();
  return useMemo(() => fd.projects.filter((p) =>
    (includeClosed || p.status === 'active' || p.status === 'on_hold')
    && (isManager || p.supervisorId === user?.id)), [fd.projects, isManager, user?.id, includeClosed]);
}
