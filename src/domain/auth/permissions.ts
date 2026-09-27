/**
 * Permission matrix (Master Spec §29). The database RLS in
 * 0006_field_ops.sql is the enforcement; this drives what the UI shows.
 *
 * Owner decisions (2026-09-27): finance is its own role and can also be
 * granted to a manager; supervisors are not counted as labor.
 */
import type { AppUser } from '@/domain/models/ops';

export type Permission =
  | 'projects.manage'
  | 'projects.view_all'
  | 'tasks.manage'          // create tasks, checklists, periodics
  | 'tasks.execute'
  | 'labor.record'          // supervisor, before month close
  | 'labor.review'
  | 'labor.edit_closed'     // with a reason, audited (BR-010)
  | 'month.close'
  | 'reports.view_all'
  | 'reports.view_own'
  | 'export'
  | 'employees.manage'
  | 'config.manage';

type Who = Pick<AppUser, 'role' | 'active' | 'financeAccess'>;

export function isSupervisorRole(role: AppUser['role']): boolean {
  return role === 'supervisor' || role === 'worker';
}

export function hasFinance(u: Who): boolean {
  return u.active && (u.role === 'finance' || u.financeAccess === true);
}

export function can(u: Who | null | undefined, p: Permission): boolean {
  if (!u || !u.active) return false;
  const manager = u.role === 'manager';
  const supervisor = isSupervisorRole(u.role);
  const finance = hasFinance(u);
  switch (p) {
    case 'projects.manage':
    case 'tasks.manage':
    case 'employees.manage':
    case 'config.manage':
      return manager;
    case 'projects.view_all':
    case 'reports.view_all':
    case 'labor.review':
    case 'export':
      return manager || finance;
    case 'tasks.execute':
    case 'labor.record':
      return manager || supervisor;
    case 'reports.view_own':
      return manager || supervisor || finance;
    case 'labor.edit_closed':
    case 'month.close':
      return finance;
  }
}
