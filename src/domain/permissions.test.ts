import { describe, expect, it } from 'vitest';
import { canViewAudit, canViewReports, hasPermission, isAdministrator, type Permission, type Role } from './permissions';

describe('role permissions', () => {
  it('treats the existing manager role as the administrator account', () => {
    expect(isAdministrator('manager')).toBe(true);
    expect(isAdministrator('supervisor')).toBe(true);
    expect(isAdministrator('worker')).toBe(false);
    expect(isAdministrator('auditor')).toBe(false);
  });

  it('gives auditors read-only report and audit access', () => {
    const roles: Role[] = ['auditor', 'manager', 'supervisor', 'worker', 'client'];
    expect(roles.filter(canViewReports)).toEqual(['auditor', 'manager', 'supervisor']);
    expect(roles.filter(canViewAudit)).toEqual(['auditor', 'manager', 'supervisor']);
  });

  it('keeps the role matrix explicit and prevents auditors from mutating data', () => {
    const mutations: Permission[] = ['manage_users', 'manage_clients', 'manage_tasks', 'approve_tasks'];
    expect(mutations.some((permission) => hasPermission('auditor', permission))).toBe(false);
    expect(hasPermission('manager', 'manage_users')).toBe(true);
    expect(hasPermission('supervisor', 'manage_users')).toBe(true);
    expect(hasPermission('worker', 'update_assigned_tasks')).toBe(true);
    expect(hasPermission('client', 'view_portal')).toBe(true);
  });
});
