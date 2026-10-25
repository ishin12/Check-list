-- 0005_storage.sql
-- Creates the private `proofs` storage bucket and the storage.objects policies
-- that let managers, assigned workers and (for approved finish proofs) clients
-- use it. Additive and safe to re-run. Run after 0004.

-- ---------------------------------------------------------------------------
-- 1. Bucket (private; 50 MB per file; photos and short videos only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs', 'proofs', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'video/mp4','video/quicktime','video/webm']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------------

-- True when the signed-in user is the worker assigned to task p_task.
-- (A later migration may CREATE OR REPLACE this to also consult a join table.)
create or replace function public.is_task_worker(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and t.assigned_worker_id = auth.uid()
  );
$$;

-- Task id encoded in the first path segment of an object name
-- ("<task uuid>/start-<uuid>.jpg"). Returns null, never an error, if the
-- segment is not a valid uuid.
create or replace function public.proof_object_task_id(p_name text) returns uuid
language sql immutable as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1)
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

-- True when the object is the 'finish' proof of an approved task that belongs
-- to the signed-in client user.
create or replace function public.client_can_read_proof_object(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.task_proofs tp
    join public.tasks t on t.id = tp.task_id
    where tp.storage_path = p_name
      and public.proof_object_task_id(tp.storage_path) = tp.task_id
      and tp.kind = 'finish'
      and t.status = 'approved'
      and t.client_id = public.current_client_id()
  );
$$;

grant execute on function public.is_task_worker(uuid) to authenticated;
grant execute on function public.proof_object_task_id(text) to authenticated;
grant execute on function public.client_can_read_proof_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. storage.objects policies for bucket 'proofs' (created only if missing).
--    Anonymous users get no policy, hence no access.
-- ---------------------------------------------------------------------------
do $$ begin
  -- Manager: everything in the bucket.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs manager select') then
    create policy "proofs manager select" on storage.objects for select to authenticated
      using (bucket_id = 'proofs' and public.is_manager());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs manager insert') then
    create policy "proofs manager insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'proofs' and public.is_manager());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs manager update') then
    create policy "proofs manager update" on storage.objects for update to authenticated
      using (bucket_id = 'proofs' and public.is_manager())
      with check (bucket_id = 'proofs' and public.is_manager());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs manager delete') then
    create policy "proofs manager delete" on storage.objects for delete to authenticated
      using (bucket_id = 'proofs' and public.is_manager());
  end if;

  -- Assigned worker: read/add/remove objects in that task's folder.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs worker select') then
    create policy "proofs worker select" on storage.objects for select to authenticated
      using (bucket_id = 'proofs' and public.is_task_worker(public.proof_object_task_id(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs worker insert') then
    create policy "proofs worker insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'proofs' and public.is_task_worker(public.proof_object_task_id(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs worker delete') then
    create policy "proofs worker delete" on storage.objects for delete to authenticated
      using (bucket_id = 'proofs' and public.is_task_worker(public.proof_object_task_id(name)));
  end if;

  -- Client: read-only, finish proofs of approved tasks of their own client.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'proofs client select') then
    create policy "proofs client select" on storage.objects for select to authenticated
      using (bucket_id = 'proofs' and public.client_can_read_proof_object(name));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (run manually; do NOT delete the bucket or its objects, they hold
-- real photos):
--   drop policy if exists "proofs manager select" on storage.objects;
--   drop policy if exists "proofs manager insert" on storage.objects;
--   drop policy if exists "proofs manager update" on storage.objects;
--   drop policy if exists "proofs manager delete" on storage.objects;
--   drop policy if exists "proofs worker select"  on storage.objects;
--   drop policy if exists "proofs worker insert"  on storage.objects;
--   drop policy if exists "proofs worker delete"  on storage.objects;
--   drop policy if exists "proofs client select"  on storage.objects;
--   drop function if exists public.client_can_read_proof_object(text);
--   drop function if exists public.proof_object_task_id(text);
--   drop function if exists public.is_task_worker(uuid);
-- ---------------------------------------------------------------------------
