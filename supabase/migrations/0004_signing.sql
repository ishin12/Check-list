-- Client signing via WhatsApp + auto-approval after a configurable window.
--
-- When a task is submitted, an Edge Function inserts a signing_links row and
-- sends a WhatsApp template with a one-tap link to /sign/<token>. The client
-- signs on a public page (no auth) via security-definer RPCs. If no signature
-- arrives before expires_at, a cron Edge Function auto-approves the task.

-- ---------------------------------------------------------------------------
-- How a task reached "approved" — drives a distinct visual treatment so an
-- auto-approval (no client response) is never mistaken for a real signature.
-- ---------------------------------------------------------------------------
create type public.approval_method as enum (
  'manager',           -- manager pressed Approve
  'client_signature',  -- client signed via the WhatsApp link
  'auto_no_response'   -- window expired with no signature
);

alter table public.tasks
  add column approval_method public.approval_method;

-- ---------------------------------------------------------------------------
-- app_settings: single-row config the manager can edit without code.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true,            -- enforce a single row
  signing_expiry_days int not null default 3,
  signing_reminder_hours int not null default 24,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- signing_links
-- ---------------------------------------------------------------------------
create type public.whatsapp_status as enum ('queued', 'sent', 'failed');

create table public.signing_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  signed_at timestamptz,
  signature_data_url text,
  auto_approved_at timestamptz,
  reminder_sent_at timestamptz,
  whatsapp_message_id text,
  whatsapp_status public.whatsapp_status not null default 'queued',
  whatsapp_error jsonb,
  created_at timestamptz not null default now()
);

create index on public.signing_links (task_id);
create index on public.signing_links (expires_at) where signed_at is null and auto_approved_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_settings  enable row level security;
alter table public.signing_links enable row level security;

-- app_settings: any authenticated user reads; only managers write.
create policy "settings read" on public.app_settings for select
  using (auth.uid() is not null);
create policy "settings manager write" on public.app_settings for all
  using (public.is_manager()) with check (public.is_manager());

-- signing_links: manager all; assigned worker on the task may read/insert.
create policy "links manager all" on public.signing_links for all
  using (public.is_manager()) with check (public.is_manager());
create policy "links worker rw" on public.signing_links for all
  using (exists (select 1 from public.tasks t
                 where t.id = signing_links.task_id
                   and t.assigned_worker_id = auth.uid()))
  with check (exists (select 1 from public.tasks t
                      where t.id = signing_links.task_id
                        and t.assigned_worker_id = auth.uid()));
-- Note: the public sign page does NOT read this table directly; it goes through
-- the security-definer RPCs below, which bypass RLS in a controlled way.

-- ---------------------------------------------------------------------------
-- Public RPCs for the unauthenticated sign page
-- ---------------------------------------------------------------------------

-- Returns a minimal task summary for a valid, unsigned, unexpired token.
-- Returns no rows otherwise (expired / signed / unknown).
create or replace function public.get_signing_task(p_token text)
returns table (
  task_title text,
  client_name text,
  worker_name text,
  scheduled_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, c.name, p.full_name, t.scheduled_at, sl.expires_at
  from public.signing_links sl
  join public.tasks t on t.id = sl.task_id
  join public.clients c on c.id = t.client_id
  left join public.profiles p on p.id = t.assigned_worker_id
  where sl.token = p_token
    and sl.signed_at is null
    and sl.auto_approved_at is null
    and sl.expires_at > now();
$$;

-- Records the client signature and approves the task. Returns true on success,
-- false if the token is no longer valid.
create or replace function public.complete_signing(p_token text, p_signature text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid;
begin
  select task_id into v_task
  from public.signing_links
  where token = p_token
    and signed_at is null
    and auto_approved_at is null
    and expires_at > now()
  for update;

  if v_task is null then
    return false;
  end if;

  update public.signing_links
    set signed_at = now(), signature_data_url = p_signature
    where token = p_token;

  update public.tasks
    set status = 'approved',
        approval_method = 'client_signature',
        decision_at = now(),
        decision_note = 'Signed by client',
        signature = jsonb_build_object('dataUrl', p_signature, 'signedAt', now(), 'signerName', null)
    where id = v_task;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (null, 'task.signed', 'task', v_task, jsonb_build_object('via', 'client_signature'));

  return true;
end;
$$;

-- Allow the anon role to call only these two functions.
grant execute on function public.get_signing_task(text) to anon;
grant execute on function public.complete_signing(text, text) to anon;
