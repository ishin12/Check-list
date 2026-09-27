# Gap Analysis — Current Repo vs Master Specification v2.1

Compares the code on `main` (commit `cc67ce9`) against `Master_Specification_v2.1_EN.md`.

## 1. What the repo is today

A React + Vite PWA on Supabase (Postgres + RLS + Edge Functions), with a full in-browser demo backend (`mockClient.ts`) that mirrors the schema. Arabic/English with RTL.

The core object is a **task = one scheduled visit assigned to one worker (app user) for one client**:

- Manager creates a task (client, worker, date, checklist template, recurrence).
- Worker must take a **start** photo/video, runs a checklist of **checked / not checked** items (some required), logs "extra work", takes a **finish** photo, and submits.
- Task then goes `submitted → approved / rejected`. Approval happens by manager, by client signing a WhatsApp link, or **automatically** when the link expires.
- On approval, a recurring task clones its next occurrence (weekly/monthly/quarterly/biannual).
- Free-text **client notes** carry forward to the client's next visit until resolved.
- PDF visit report with signature; client portal; notifications (email + WhatsApp); audit log of task status changes; users admin (manager/worker/client); calendar; today screen.

Roles: `manager`, `worker`, `client`. Tables: `profiles, clients, templates, tasks, task_proofs, client_notes, notifications, audit_log, app_settings, signing_links`.

## 2. The fundamental difference

The spec is a **Project → Visit → Task items + Crew labor-days** system run by a **supervisor**, whose #1 goal is **labor allocation for finance**. The repo is a **single-worker checklist-and-proof** system run by a **worker**, whose center is **client approval**.

Three conceptual shifts drive almost everything else:

1. **Workers are not users.** In the spec, laborers are `Employees` (name + status, no login). The supervisor is the user and selects several employees per visit. In the repo, "worker" is a logged-in account assigned to one task.
2. **Labor allocation is missing entirely.** No employees table, no full/half-day records, no ≤ 1.0/day rule, no unallocated list, no month close, no finance reports. This is Goal 1 of the spec.
3. **Status lives on each task item, not on the whole visit.** The spec's item states are `OPEN / COMPLETED / NEEDS_FOLLOW_UP`, and follow-up items roll into the next visit automatically. The repo only has a boolean `checked` per item and a free-text notes list — which the spec explicitly says not to rely on (§7).

## 3. Feature-by-feature comparison

Legend: ✅ exists and fits · 🟡 exists, needs rework · ❌ missing · ⚠️ exists but conflicts with the spec

| Spec area | Repo today | Status |
|---|---|---|
| **Projects** (code, name, client, type, status, supervisor) | Only `clients`. No project entity, type, stage or status. | ❌ |
| **Project types** configurable (Establishment / Maintenance / Modification / Other + add) | None | ❌ |
| **Project states** ACTIVE → ON_HOLD → COMPLETED/CLOSED, never deleted | Clients can be deleted; `tasks.client_id … on delete cascade` wipes history | ❌ / ⚠️ |
| **Visits** PLANNED → IN_PROGRESS → COMPLETED | `tasks` table plays this role with states `not_started / in_progress / submitted / approved / rejected` | 🟡 rename + restate |
| **Visit start in < 1 min: pick project → start → pick crew** | Manager must pre-create each task; worker can't start an ad-hoc visit | ❌ |
| **Supervisor home**: today's visits, open follow-ups, + Start visit, unallocated workers | `TodayScreen` shows today's tasks only | 🟡 |
| **Task item** description + status (3 states) + optional photo + optional note | Template item = label + `required`; result = `checked` + note | 🟡 |
| **NEEDS_FOLLOW_UP auto-carry to next visit** (BR-005/006, TC-04) | Free-text `client_notes` carry-forward per client | 🟡 replace |
| **Manager adds ad-hoc tasks to a specific visit/project** | Only via template; "extra work" is free text written by the worker | ❌ |
| **Checklist templates** by project type / stage, admin-editable | Bilingual templates exist, but not tied to type/stage | 🟡 |
| **Stage checklists for new projects** (6 stages, gating) | None | ❌ |
| **Periodic maintenance items** with last-done + next-due, shown only when due (BR-011, TC-06) | Recurrence is on the **whole task** and clones on approval; no per-item last/next dates | 🟡 redesign |
| **Employees** (ID, name, ACTIVE/INACTIVE) | Workers are auth users in `profiles` | ❌ |
| **Labor allocation** full/half day, multi-select, one record per worker (BR-001…004, TC-01…03) | None | ❌ |
| **DB-level protection against > 1.0/day + race conditions** (TC-12) | None | ❌ |
| **Copy crew from previous visit/day** | None | ❌ |
| **Unallocated workers list/report** (TC-11) | None | ❌ |
| **Month Close** + supervisor lock + privileged edit with reason (BR-009/010, TC-07/08) | None | ❌ |
| **Photos**: before/after per task item, optional, required only where configured (BR-012) | Mandatory start/finish proof per visit; gates the workflow | ⚠️ |
| Photos in object storage, metadata in DB | Yes (`proofs` bucket + `task_proofs`), offline upload queue | ✅ |
| **Auto visit report PDF** (client, project, date, required/done work, before/after photos, follow-ups, supervisor, client rep + signature space) | PDF report + signature exists | 🟡 adapt content |
| **Project history page** (visits, done/open/follow-up tasks, photos, reports, labor) | `ClientDetailScreen` shows open notes and tasks | 🟡 |
| **Supervisor change keeps history** (BR-007, TC-05) | RLS lets a worker see only tasks where `assigned_worker_id = self` — a replacement can't see prior history | ⚠️ |
| **Reports**: worker, project, unallocated, open/overdue, visits done, monthly allocation | None (only audit screen) | ❌ |
| **Excel export** | None | ❌ |
| **Roles** Admin/Manager, Supervisor, Finance (can merge with Admin) | `manager / worker / client` | 🟡 |
| **Permission matrix** (§29) | Manager-all vs worker-own RLS | 🟡 |
| **Audit**: created_by/updated_by on all records; old/new value + reason on sensitive edits | Audit log of task status only; no `updated_by`; no old/new values or reason | 🟡 |
| **No hard delete** (BR-014, TC-10) | Template delete, proof delete, cascade deletes | ⚠️ |
| **Languages AR + EN + Urdu**, extensible | AR + EN only; `LocalizedText` hard-typed to `en | ar` | 🟡 |
| RTL from day one | Yes | ✅ |
| Mobile first + desktop | Yes (bottom tabs + side nav ≥ 1024px) | ✅ |
| Clear save success/failure, no false "saved" | Offline media queue exists; data saves need review | 🟡 |
| Staging separate from production | Single Supabase project; demo mode only | ❌ |
| Automated tests for BR-001…015 and TCs | Vitest set up; tests cover recurrence/template/taskFlow only | 🟡 |
| No secrets in repo | Anon key in build env; secrets in Supabase | ✅ (verify) |

## 4. Things in the repo the spec does not ask for

Section 22 says: do not add workflows not in the spec. These exist today and need an owner decision (not deletion by default):

| Feature | Spec position | Recommendation |
|---|---|---|
| Client login + portal | Not in spec; client only appears as a name on the report | Hide behind a flag for MVP |
| WhatsApp signing link + reminders | Open Question #2 (in-app e-signature vs. signature space in PDF) | Keep dormant until Q2 is answered |
| **Auto-approve when client doesn't respond** | Not in spec; visit is COMPLETED by the supervisor | Remove from the visit state machine |
| Manager approve/reject step (`submitted/approved/rejected`) | Not in spec's state machine (§27 forbids new states) | Drop; manager *reviews* reports instead |
| Mandatory start/finish proof | Contradicts BR-012 | Replace with optional before/after per item |
| Time-on-task minutes | Not required; spec measures labor in days | Keep as internal timestamps only |
| Email/WhatsApp notifications | Not mentioned | Keep in-app; decide on email |

## 5. What is reusable as-is

Auth (email/password + invite), Supabase/RLS pattern, demo backend, i18n + RTL, app shell/navigation, bilingual template editor, PDF generator, signature pad, camera capture + offline upload queue, recurrence date math, audit screen, users admin, PWA + GitHub Pages deploy. Roughly half the codebase survives; the domain model and main flows get rebuilt.

## 6. Decisions log

| Date | Decision | Effect |
|---|---|---|
| 2026-09-27 | Hide WhatsApp signing for now | `VITE_FEATURE_WHATSAPP_SIGNING` flag, off by default. Submit no longer sends a link; signing-window settings hidden; with no links, the reminder/auto-approve crons do nothing. Code and data kept. |
| 2026-09-27 | Finance is a separate role and can also be granted to a manager | `finance` role + `profiles.finance_access`. Month close and post-close labor edits require finance; a manager without the grant cannot do them. |
| 2026-09-27 | Supervisors are not counted as labor | Supervisors are app users; crew are `employees` (no login). Allocations reference employees only. |

Still open (§36): who holds Month Close in production (default now: anyone with finance), in-app e-signature vs. PDF signature space, override for closing a project with open tasks (default now: blocked), final checklists per type/stage, maintenance frequencies, worker-cost policy. Also open: whether the client portal stays (untouched so far).

## 7. Recommended plan

Evolve this repo rather than rewrite: the infrastructure is solid and matches §33. Work in phases; each ends with something testable in demo mode.

### Phase 0 — Decisions (before coding)
- Owner answers the §36 questions, plus: keep/hide client portal and WhatsApp signing; is Finance a separate role in V1; do supervisors also appear as Employees for labor.
- Confirm initial project types, stages and maintenance item lists (seed data only — all editable later).

### Phase 1 — Data model ✅ done (`0005_roles.sql`, `0006_field_ops.sql`, demo mirror, tests)

Delivered: all tables below; BR-001/002/003 enforced by a DB trigger with a per-worker-per-day advisory lock (TC-12 verified with two concurrent sessions, and verified to fail without the lock); month close + finance override with reason and old/new audit; visit/task/project state machines; recurring roll-forward; no-delete guards; RLS so a replacement supervisor sees the whole project history. Business rules also live as pure TypeScript in `src/domain/labor`, `src/domain/fieldops`, `src/domain/auth`, shared by the UI and the demo backend. Tests: `npm test` (unit + demo backend) and `npm run test:db` (real Postgres).

Deferred to Phase 2 on purpose: migrating existing `tasks` rows into visits (only once the new screens replace the old ones), renaming the `worker` role to `supervisor`, a `start_visit` RPC that builds the visit's task list server-side, and Urdu names in config rows (need a native speaker check).

Original plan for reference:
- `project_types`, `project_stages` (config tables).
- `projects` (code, name, client_id, type_id, stage_id, status enum, supervisor_id, notes, created/updated_by).
- `employees` (name, status, optional profile link) — separate from login users.
- `visits` (project_id, date, supervisor_id, status PLANNED/IN_PROGRESS/COMPLETED). Migrate existing `tasks` rows into visits.
- `project_tasks` (project_id, visit_id nullable, description, status OPEN/COMPLETED/NEEDS_FOLLOW_UP, photo_required, template_item_id, completed_in_visit_id). Open/follow-up items attach to the project, so every next visit shows them.
- `checklist_templates` + `checklist_items` (scope: project type and/or stage; recurrence interval; photo_required).
- `project_recurring_items` (project_id, item_id, interval, last_done_at, next_due_at) — BR-011.
- `task_photos` (task_id, visit_id, project_id, kind before/after, storage_path).
- `labor_allocations` (date, employee_id, project_id, visit_id, duration 0.5|1.0 check, supervisor_id, voided_at, void_reason).
  - BR-001 enforced **in the database**: a trigger that takes `pg_advisory_xact_lock(employee_id, date)` and rejects when the day's non-voided sum would exceed 1.0 (TC-12).
- `month_closes` (month, closed_by, closed_at) + trigger blocking allocation writes in a closed month unless the caller has the override permission; override writes old/new/reason to `audit_log`.
- Roles: add `supervisor` and `finance` (keep `manager` as admin); rewrite RLS so supervisors see **all history of projects assigned to them**, not only rows they created (BR-007).
- Replace `on delete cascade` with restrict + status/archive columns (BR-014).
- Audit trigger generalized to projects, visits, tasks, allocations with old/new payload.

### Phase 2 — Supervisor flow (the daily path, < 1 minute)
1. **Home:** today's visits · open & follow-up items · big **+ Start visit** · unallocated employees today.
2. **Start visit:** pick project (search) → visit created → **crew picker**: multi-select employees, full/half toggle per person, "copy yesterday's crew", live blocking of anyone already at 1.0.
3. **Visit screen:** list = manager tasks for the project + carried follow-ups + due periodic items + stage checklist. Each item: one-tap **Done / Not done / Needs follow-up**, optional before/after photo, optional note.
4. **Complete visit:** validate required items/photos and crew → COMPLETED → report generated automatically.

### Phase 3 — Manager/admin
Projects list + create/edit + change supervisor; **project history page** (visits, tasks by status, photos, reports, labor days); template editor extended with type/stage/recurrence/photo-required; config screens for project types, stages, employees; overdue/open dashboard.

### Phase 4 — Reports & finance
Worker report, project labor report, unallocated report, open/overdue tasks, visits done, monthly allocation matrix — all filterable by period/project/worker and exportable to **Excel (.xlsx)**. Month-close screen with privileged edit + reason.

### Phase 5 — Hardening
Urdu locale (`LocalizedText` → open map; Urdu is RTL), automated tests for BR-001…015 and TC-01…12 (DB-level tests for the allocation trigger), staging Supabase project, backup/restore check, clear save-failure UX, rework visit report PDF to the §12 contents.

## 8. Risks / things to push back on

- **The demo backend doubles the work.** Every schema change must be reimplemented in `mockClient.ts`, including the 1.0/day rule and month-close lock. Worth keeping (it's how the owner tests), but budget for it.
- **BR-001 cannot live only in the UI.** It must be a DB trigger/constraint with locking, or TC-12 fails.
- **Existing production data.** The live Supabase project already has clients/tasks; Phase 1 needs a data migration, not a fresh schema.
- **Removing the client approval flow is a product decision**, not a technical one — confirm before deleting.
