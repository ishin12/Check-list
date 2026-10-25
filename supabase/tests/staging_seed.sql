-- Synthetic staging data shaped like production (production holds no live
-- data yet). Fixed UUIDs so tests can reference rows. Applied after
-- 0001-0004 only, before the new migrations, to exercise their backfills.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- manager
  ('00000000-0000-0000-0000-0000000000b1'),  -- worker 1
  ('00000000-0000-0000-0000-0000000000b2'),  -- worker 2
  ('00000000-0000-0000-0000-0000000000b3'),  -- worker 3
  ('00000000-0000-0000-0000-0000000000c1');  -- client user

insert into public.clients (id, name, phone, address) values
  ('10000000-0000-0000-0000-000000000001', 'Al Olaya Tower', '+966500000001', 'Al Olaya, Riyadh'),
  ('10000000-0000-0000-0000-000000000002', 'Najd Villas', '+966500000002', 'Al Malqa, Riyadh'),
  ('10000000-0000-0000-0000-000000000003', 'Diriyah Office', null, null);

insert into public.profiles (id, role, full_name, email, phone, client_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'manager', 'Maha Manager', 'manager@example.test', null, null),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Wasim Worker', 'w1@example.test', null, null),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Worker', 'w2@example.test', null, null),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Imran Worker', 'w3@example.test', null, null),
  ('00000000-0000-0000-0000-0000000000c1', 'client', 'Client Contact', 'c1@example.test', null,
   '10000000-0000-0000-0000-000000000001');

insert into public.templates (id, title, tasks) values
  ('20000000-0000-0000-0000-000000000001', '{"en":"Garden maintenance","ar":"صيانة الحديقة"}',
   '[{"id":"t1","label":{"en":"Trim hedges","ar":"تقليم الأسوار"},"required":true}]'),
  ('20000000-0000-0000-0000-000000000002', '{"en":"Irrigation check","ar":"فحص الري"}', '[]');

insert into public.tasks (id, title, template_id, client_id, assigned_worker_id, scheduled_at, status, recurrence, results, extra_work) values
  ('30000000-0000-0000-0000-000000000001', 'Weekly garden', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', now() + interval '1 day', 'not_started', 'weekly', '[]', '[]'),
  ('30000000-0000-0000-0000-000000000002', 'Irrigation', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', now(), 'in_progress', 'none', '[]', '[]'),
  ('30000000-0000-0000-0000-000000000003', 'Hedge trim', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', 'submitted', 'none', '[{"taskId":"t1","checked":true}]', '[]'),
  ('30000000-0000-0000-0000-000000000004', 'Monthly service', null, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b3', now() - interval '7 days', 'approved', 'monthly', '[]', '[{"id":"e1","body":"Fixed valve","addedAt":"2026-10-01T09:00:00Z","addedBy":"00000000-0000-0000-0000-0000000000b3"}]'),
  ('30000000-0000-0000-0000-000000000005', 'Rejected visit', null, '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', now() - interval '3 days', 'rejected', 'none', '[]', '[]');

insert into public.task_proofs (task_id, kind, storage_path, mime, captured_at, uploaded_by) values
  ('30000000-0000-0000-0000-000000000002', 'start', '30000000-0000-0000-0000-000000000002/start-a.jpeg', 'image/jpeg', now(), '00000000-0000-0000-0000-0000000000b2'),
  ('30000000-0000-0000-0000-000000000003', 'start', '30000000-0000-0000-0000-000000000003/start-b.jpeg', 'image/jpeg', now(), '00000000-0000-0000-0000-0000000000b1'),
  ('30000000-0000-0000-0000-000000000003', 'finish', '30000000-0000-0000-0000-000000000003/finish-c.jpeg', 'image/jpeg', now(), '00000000-0000-0000-0000-0000000000b1');

insert into public.client_notes (client_id, body, created_in_task_id) values
  ('10000000-0000-0000-0000-000000000001', 'Gate code changed', '30000000-0000-0000-0000-000000000003');

insert into public.signing_links (task_id, token, expires_at) values
  ('30000000-0000-0000-0000-000000000003', 'staging-token-1', now() + interval '3 days');
