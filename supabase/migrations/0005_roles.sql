-- Roles for the field-ops model (Master Spec v2.1 §10, §29).
--
-- Kept in its own file: Postgres cannot use a newly added enum value in the
-- same transaction that adds it, and the Supabase SQL editor runs a file as
-- one transaction. Run this file, then 0006_field_ops.sql.
--
--   supervisor — runs visits, picks the crew, updates tasks.
--   finance    — reviews labor, closes the month, exports.
--
-- The legacy 'worker' value stays until the old task screens are replaced;
-- the helpers in 0006 treat 'worker' as a supervisor.

alter type public.user_role add value if not exists 'supervisor';
alter type public.user_role add value if not exists 'finance';
