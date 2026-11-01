-- Additive role migration. `manager` remains the administrator role for
-- compatibility with existing users and policies.
alter type public.user_role add value if not exists 'auditor';

create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.current_role()::text = 'manager' then true
    when public.current_role()::text = 'auditor' then p_permission = any (array[
      'view_reports', 'view_financials', 'view_audit'
    ]::text[])
    when public.current_role()::text = 'worker' then p_permission = any (array[
      'view_assigned_tasks', 'update_assigned_tasks', 'manage_assigned_proofs',
      'manage_assigned_notes', 'view_notifications', 'view_own_report'
    ]::text[])
    when public.current_role()::text = 'client' then p_permission = 'view_portal'
    else false
  end;
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Auditor access is read-only and scoped to reporting/audit data. No INSERT,
-- UPDATE, DELETE, invite, approval, or task-assignment policy is added.
create policy "profiles auditor read" on public.profiles for select
  using (public.has_permission('view_audit'));
create policy "clients auditor read" on public.clients for select
  using (public.has_permission('view_reports'));
create policy "tasks auditor read" on public.tasks for select
  using (public.has_permission('view_reports'));
create policy "proofs auditor read" on public.task_proofs for select
  using (public.has_permission('view_reports'));
create policy "notes auditor read" on public.client_notes for select
  using (public.has_permission('view_reports'));
create policy "audit auditor read" on public.audit_log for select
  using (public.has_permission('view_audit'));
