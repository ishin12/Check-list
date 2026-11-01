-- Supervisor is a second full-access operational role. Keep manager as the
-- administrator role for existing accounts and use is_manager() as the
-- shared full-access check.
alter type public.user_role add value if not exists 'supervisor';

create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.current_role()::text = any (array['manager', 'supervisor']::text[]) then true
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

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role::text = any (array['manager', 'supervisor']::text[])
      and active
  );
$$;

-- Submitted-task notifications must reach both full-access operational roles.
create or replace function public.notify_task_submitted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    insert into public.notifications (user_id, kind, payload)
    select p.id, 'task.submitted',
           jsonb_build_object('task_id', new.id, 'title', new.title,
                              'worker_id', new.assigned_worker_id,
                              'worker_ids', coalesce(
                                (select jsonb_agg(tw.worker_id order by tw.created_at)
                                 from public.task_workers tw where tw.task_id = new.id),
                                jsonb_build_array(new.assigned_worker_id)))
    from public.profiles p
    where p.role::text = any (array['manager', 'supervisor']::text[])
      and p.active;
  end if;
  return new;
end;
$$;

-- Workers may reject only work assigned to them, before submission, and must
-- provide a reason. Managers/supervisors retain their existing approval flow.
create or replace function public.guard_task_worker_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;
  if new.client_id is distinct from old.client_id then
    raise exception 'only managers can change the client of a task' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status = 'rejected' then
    if old.status in ('not_started', 'in_progress')
       and public.is_task_worker(new.id)
       and nullif(trim(new.decision_note), '') is not null then
      return new;
    end if;
    raise exception 'workers can reject assigned work only with a reason' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status = 'approved' then
    raise exception 'only managers can approve a task' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.notify_worker_rejected() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status
     and new.status = 'rejected'
     and auth.uid() is not null
     and not public.is_manager() then
    insert into public.notifications (user_id, kind, payload)
    select p.id, 'task.worker_rejected', jsonb_build_object(
      'task_id', new.id,
      'title', new.title,
      'reason', new.decision_note,
      'worker_id', auth.uid()
    )
    from public.profiles p
    where p.role::text = any (array['manager', 'supervisor']::text[])
      and p.active;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_tasks_notify_worker_rejected'
                 and tgrelid = 'public.tasks'::regclass) then
    create trigger trg_tasks_notify_worker_rejected
      after update of status, decision_note on public.tasks
      for each row execute function public.notify_worker_rejected();
  end if;
end $$;
