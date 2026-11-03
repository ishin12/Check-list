import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { useDirectory } from '@/app/providers/DirectoryContext';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { can, hasFinance, isSupervisorRole } from '@/domain/auth/permissions';
import { makeTaskLabeler } from '@/services/data/visitFlow';
import type { Project } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { targetOfPlace } from '@/domain/reports/reports';

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
  const { t } = useTranslation();
  const { workers, clients } = useDirectory();
  const fd = useFieldData();
  const { language } = useLanguage();
  const labeler = useMemo(() => makeTaskLabeler(fd.templates as never, language), [fd.templates, language]);
  return {
    person: useCallback((id?: string) => (id ? workers.get(id)?.fullName ?? workers.get(id)?.email ?? '—' : '—'), [workers]),
    client: useCallback((id?: string) => (id ? clients.get(id)?.name ?? '—' : '—'), [clients]),
    // Two workers with the same name are told apart by their employee no. (UAT M1).
    employee: useCallback((id?: string) => {
      const e = id ? fd.employee(id) : undefined;
      if (!e) return '—';
      const same = fd.employees.some((x) => x.id !== e.id && x.fullName.trim().toLowerCase() === e.fullName.trim().toLowerCase());
      return same && e.code ? `${e.fullName} (${e.code})` : e.fullName;
    }, [fd]),
    project: useCallback((id?: string) => (id ? fd.project(id)?.name ?? t('fo.labor.otherProject', 'A project no longer assigned to you') : '—'), [fd, t]),
    taskLabel: labeler,
    workType: useCallback((id?: string) => (id ? configText(fd.workType(id)?.name, language) || '—' : '—'), [fd, language]),
    target: useCallback((id?: string) => (id ? configText(fd.target(id)?.name, language) || '—' : '—'), [fd, language]),
    /** A report "project / target" key (placeOf): project name, or the operational target's name. */
    place: useCallback((key?: string) => {
      if (!key) return '—';
      const target = targetOfPlace(key);
      if (target !== undefined) return configText(fd.target(target)?.name, language) || '—';
      return fd.project(key)?.name ?? t('fo.labor.otherProject', 'A project no longer assigned to you');
    }, [fd, language, t]),
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
