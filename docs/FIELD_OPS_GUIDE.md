# Ghsoon Najd — Field Operations: how to use it

Built to the Master Specification v2.1 (`docs/spec/`). The app works in English, Arabic and Urdu (Settings → Language) on phone and desktop.

## Roles

| Role | Does | Lands on |
|---|---|---|
| **Supervisor** | Starts visits, picks the crew, records work and photos, completes visits | Today |
| **Manager** | Everything a supervisor can, plus projects, tasks, checklists, workers, setup, reports | Today |
| **Finance** | Reports, Excel, labor ledger, month close, edits after close (with reason) | Reports |
| **Manager + finance** | A manager with "Finance access" ticked in Team & clients | Today |

Workers (crew) are **not** app users. They are records under **Workers**, picked on each visit. Supervisors are never counted as labor.

## Supervisor — a visit in under a minute

1. **Today → Start visit**, pick the project.
2. Tick the crew. Each person is **Full** or **Half** day. **Copy last crew** repeats the previous visit's crew. Anyone already on a full day elsewhere can't be picked.
3. **Start visit.** The screen lists what's required:
   - follow-ups and open items carried from earlier visits,
   - tasks the manager added,
   - periodic maintenance that is due,
   - the project's checklist (and its stage checklist for new projects).
4. Tap **Done**, **Not done** or **Follow-up** on each item. Add a **Before/After** photo from the camera and a note when useful. Items marked 📷 need a photo before they count as done. A mis-tapped **Done** can be changed until the visit is completed.
5. **Complete visit.** The app checks the crew and required items, then builds the report. **Follow-up** and **Not done** items stay open and appear on the next visit automatically.
6. On the report, enter the client representative's name and **Share PDF**. The PDF has a signature line.

Visits never completed show at the top of Today until someone finishes them.

## Manager

- **Projects → New**: name, client, type (Establishment / Maintenance / Modification / Other), stage for new projects, supervisor. Periodic items from the type's checklists start being tracked automatically.
- **Project page** tabs: Overview, Visits (plan a visit for a date and supervisor), Tasks (add a task for the next visit), Periodic (frequency, next due, pause), Photos, Labor.
- **Changing the supervisor** keeps the whole history. The new supervisor sees every visit, task and photo.
- **Close / Mark completed** is blocked while open or follow-up tasks remain. Closed projects stay searchable and are never deleted.
- **Checklists**: link each checklist to a project type, or to one stage of new projects. Per item, set Required, Photo required and a frequency (Every visit / weekly / monthly / every 3 or 6 months).
- **Setup**: project types, stages, working days. **Workers**: add or deactivate crew.

## Finance

- **Reports**: by worker, by project, monthly distribution (workers × projects), not allocated, open & overdue, visits done. Filter by period, project and worker. **Excel** exports one report; **All reports** exports every sheet.
- **Labor**: every allocation. Rows are voided with a reason, never deleted.
- **Month close**: review the checklist, then **Close month**. Afterwards supervisors can't change that month's labor. Finance can, but only with a reason, and every change appears in the **Audit log** with old and new values.

## Rules the system enforces (also in the database)

- A worker is never booked for more than **1.0 day** per date, including when two supervisors save at once (BR-001/003).
- Labor is only **1.0 or 0.5** (BR-002). Picking a group creates one record per worker (BR-004).
- Completing a visit never closes a follow-up (BR-005/006).
- A closed month is locked for supervisors; finance edits need a reason and are audited (BR-009/010).
- Periodic items keep their last-done and next-due dates. A missed item stays due (BR-011).
- Completed visits, completed tasks, labor, reports, projects and workers can't be deleted (BR-014).

## Decisions and defaults to confirm

These were decided by the owner or set as safe defaults. Change them if they don't match how you work.

- WhatsApp signing: **hidden** (owner). The client portal is unchanged.
- Finance: **separate role**, can be granted to managers (owner).
- Supervisors: **not labor** (owner).
- Month close: whoever holds finance (§36 Q1, default). **Refused while a visit of that month is in progress** (v2.2 §36A, approved).
- Client signature: a **signature line on the PDF**, no in-app e-signature (v2.2 §36A, approved).
- Closing a project with open tasks: **blocked**, no override (v2.2 §36A, approved).
- Work type: chosen once per visit and applied to its crew; managed list in Setup (v2.2 §36A).
- Work with no project: recorded on an **operational target** (warehouse, office, training, leave, absence…), never on a made-up project (v2.2 §36A).
- Checklists and frequencies: seeded with the §8 maintenance list; **frequencies left unset** in production (§36 Q4/Q5).
- No salary, allowance, day cost or payroll data is stored in the system; finance uses the exported days outside it (v2.2 §36A, TC-16).
- Working days: Saturday–Thursday by default (Setup).
- A "Done" tap can be corrected only while its visit is still in progress.
- Urdu translations should be reviewed by a native speaker.
