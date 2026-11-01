import type { Role } from './models/ops';
export type { Role } from './models/ops';

/** The product keeps `manager` as the database-compatible administrator role. */
export type Permission =
  | 'manage_users'
  | 'manage_clients'
  | 'manage_tasks'
  | 'manage_templates'
  | 'approve_tasks'
  | 'view_reports'
  | 'view_financials'
  | 'view_audit'
  | 'view_assigned_tasks'
  | 'update_assigned_tasks'
  | 'manage_assigned_proofs'
  | 'manage_assigned_notes'
  | 'view_notifications'
  | 'view_own_report'
  | 'view_portal'
  | 'change_own_password';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  manager: [
    'manage_users', 'manage_clients', 'manage_tasks', 'manage_templates',
    'approve_tasks', 'view_reports', 'view_financials', 'view_audit',
    'view_notifications', 'change_own_password',
  ],
  worker: [
    'view_assigned_tasks', 'update_assigned_tasks', 'manage_assigned_proofs',
    'manage_assigned_notes', 'view_notifications', 'view_own_report',
    'change_own_password',
  ],
  auditor: [
    'view_reports', 'view_financials', 'view_audit', 'change_own_password',
  ],
  client: ['view_portal', 'change_own_password'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isAdministrator(role: Role): boolean {
  return role === 'manager';
}

/** Read-only operational reporting, including completion and approval summaries. */
export function canViewReports(role: Role): boolean {
  return hasPermission(role, 'view_reports');
}

/** Read-only accountability history. */
export function canViewAudit(role: Role): boolean {
  return hasPermission(role, 'view_audit');
}
