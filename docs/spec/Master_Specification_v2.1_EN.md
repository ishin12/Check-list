# Field Operations & Labor Allocation System — Master Specification v2.1 (MVP)

> English translation of `Master_Specification_v2.1_AR.docx` (Ghsoon Najd). Arabic original is authoritative.

| Item | Detail |
|---|---|
| Goal 1 | Track laborers and allocate their days and costs to projects and cost centers. |
| Goal 2 | Follow new projects, maintenance and modifications, and make sure no required work is forgotten. |
| Design principle | Light and fast for the supervisor; complexity and reporting run in the background. |

## PART A — Operational Requirements

### 1. System boundaries
Not an ERP and not a complex project-management system. V1 covers field operations, task follow-up, visit documentation and labor allocation only:
- Track active and old projects.
- Manage visits and field tasks.
- Checklists by work type and project stage.
- Follow up periodic maintenance work.
- Labor allocation: full day / half day.
- Before/after photos when needed.
- Carry forward unfinished work or work needing follow-up.
- Automatic visit report for the client.
- Labor and project reports for finance and management.

### 2. Simplified structure
`Project / Site → Visit → Checklist & Tasks → Crew Allocation → Complete Visit → Report → Follow-up`

The supervisor must not jump between separate systems. One visit bundles tasks, labor and documentation.

### 3. Project types
| Type | Description |
|---|---|
| Establishment / Execution | New project going through stages and preparations before/during planting and execution. |
| Maintenance | Contract or site with periodic visits and recurring work. |
| Modification / Addition | Modification, expansion or remediation on an existing site. |
| Other | Type that management can add when needed. |

### 4. Supervisor home screen
- Today's visits.
- Open tasks / needing follow-up.
- **+ Start visit.**
- Workers not allocated today.
- Project's previous history when opened.
- Mobile first, minimum buttons and steps.

### 5. Daily visit cycle
| # | Step | Detail |
|---|---|---|
| 1 | Select project | Supervisor picks from projects assigned to them. |
| 2 | Start visit | System creates a Visit with today's date/time. |
| 3 | Select workers | Multi-select workers + full or half day. |
| 4 | Show what's required | Assigned tasks + the due checklist per project/stage. |
| 5 | Execute | Supervisor updates item statuses, adds photo/note when needed. |
| 6 | Follow-up | Any item "Needs follow-up" stays open and carries to the next visit. |
| 7 | Complete visit | System validates items and labor, then closes the visit. |
| 8 | Report | Visit report generated automatically from recorded data. |

### 6. Labor and cost loading
When starting a visit the supervisor selects the workers present. A worker linked to the visit is not re-entered on a separate screen.
- Select several workers at once.
- Duration: full day = 1.0, half day = 0.5.
- A worker's total load per day cannot exceed 1.0.
- Half day on one project + half day on another is allowed.
- Daily list of unallocated workers.
- Copy the allocation from the previous visit/day when needed.
- The database keeps a separate record per worker even when a group is selected at once.

The supervisor does not compute cost. The system stores days; finance later links them to the approved worker cost to show labor cost per project.

### 7. Tasks — simplest possible model
| Field | Detail |
|---|---|
| Required work | Short description. |
| Status | Not done / Done / Needs follow-up. |
| Photo | Before/after when needed; not mandatory for every item. |
| Note | Optional; used for clarification or reason for not doing it. |

If "Needs follow-up" is chosen, the item stays open and appears automatically in the next visit until closed. The system must not rely on free-text notes that can be forgotten.

### 8. Maintenance — checklist and periodic work
Two kinds of items: tasks the manager sets for a specific visit, and periodic work whose due date the system tracks. Examples: irrigation network check; plant and general condition check; pruning; fertilizing; spraying / pest control; weeding; cleaning; pumps/equipment check where applicable; special replacements or treatments.

Management sets the frequency of periodic items. The system keeps the last execution and shows the item when due. Not every item should appear as mandatory on every visit.

### 9. New projects — stage checklists
Each stage has a checklist to ensure no progress before verifying key items.
| Stage | Detail |
|---|---|
| Site handover & preparation | Receive site, review condition, notes and obstacles. |
| Preparatory works | Check agricultural wool (if applicable), soil, basins, levels, preparation. |
| Irrigation network | Inspect network, test, notes and required fixes. |
| Planting readiness | Confirm soil, irrigation and site are ready before planting. |
| Planting / Execution | Follow the approved execution items for the project. |
| Inspection & handover | Inspect works and notes; close or hand over. |

Detailed lists per stage are managed and edited by management, so no code change is needed to add a technical item.

### 10. Manager vs supervisor
| Role | Responsibilities |
|---|---|
| Manager | Create/manage projects, assign supervisor, add tasks, define checklists and periodics, follow overdue and open items, review reports. |
| Supervisor | Receive the requirements, start visit, select workers, execute and update the checklist, upload photos when needed, record follow-ups, complete visit. |

Tasks and history belong to the **project**, not only the supervisor. When the supervisor changes or is on leave, the replacement sees the full history and open work.

### 11. Photos and documentation
- A photo is linked to the task, the visit and the project.
- Supports before/after when needed.
- Photos are not mandatory for every task; management defines which items require a photo.
- Photos appear in the project history and the relevant visit report.

### 12. Client visit report
The supervisor does not rewrite a report on completion; the system generates it. Contents: client name and project/site; visit date; required work; executed work; relevant before/after photos; work needing follow-up or next visit; supervisor name; client representative name with a place for signature and approval; shareable PDF.

### 13. Project history
When a project is opened, its history appears even if the supervisor changed: previous visits; completed tasks; open tasks; follow-up work; photos; visit reports; labor loaded onto the project.
Old projects are never deleted; their status becomes Closed/Completed and they remain searchable.

### 14. Management and finance reports
- Worker report: where they worked and how many days in a period.
- Project report: workers who worked on it and days per worker.
- Unallocated workers report.
- Open, overdue and needs-follow-up tasks report.
- Completed visits report.
- Monthly labor-allocation-by-project report.
- Excel export for finance.
- PDF for client visit reports.

### 15. Minimum database
| Table | Fields |
|---|---|
| Employees | ID, Name, Status |
| Projects | ID/Code, Name, Client, Type, Status, Supervisor |
| Visits | ID, Project ID, Date, Supervisor, Status |
| Tasks | ID, Project/Visit ID, Description, Status, Follow-up Flag |
| Checklist Templates | Project Type/Stage, Checklist Item, Recurrence if applicable |
| Task Photos | Task ID, Before/After, Image, Date |
| Labor Allocation | Date, Employee ID, Project/Visit ID, Duration, Supervisor |
| Reports | Visit ID, Report Number, Approval/Signature Status |

### 16. Core rules
- A worker cannot be loaded more than 1.0 day per day.
- A follow-up task does not disappear when the visit closes.
- A closed project keeps its full history.
- Changing supervisor does not change or lose project history.
- Checklists editable by management without code changes.
- Periodics keep last execution date and next due date.
- After the monthly labor close, a supervisor cannot edit that month without higher permission.
- An audit log of important changes is preferred.

### 17. UX simplicity criteria
Mobile first; minimum mandatory fields; group-select workers; one-tap checklists; capture photo directly from the phone; never ask the supervisor to write a manual report; show only what the supervisor needs today; languages: **Arabic + English + Urdu**, extensible.

### 18. Out of MVP scope
Full CRM; quotations and invoices; purchasing and inventory; accounting and payroll; continuous GPS tracking; Gantt charts; internal chat; advanced document management.

### 19. V1 acceptance criteria
Create and classify a project (Establishment/Maintenance/Modification/Other); create a visit and assign it to a supervisor; show the right tasks and checklist; select several workers and link them to the visit at full/half day; prevent double-loading a worker; record task status and before/after photos when needed; auto-carry "needs follow-up"; manage periodic maintenance and show what's due; support stage checklists for new projects; close the visit and generate a PDF; keep project history on supervisor change; labor, project and open-task reports; Excel export.

### 20. Short user journeys
- **Supervisor:** Project → Start visit → Select workers → Execute tasks/checklist → Photos if needed → Complete visit.
- **Manager:** Create project → Define requirements and periodics/stages → Follow open and overdue → Review visit and report.
- **Finance:** Month end → Review unallocated workers → Close month → Extract labor days/cost per project.

### 21. Required end result
The system must easily answer two questions:
- **Labor:** where did each worker work, for how many days, and which project bears the cost?
- **Operations:** what is required in each project/visit, what was done, what wasn't, and what needs follow-up?

## PART B — AI Developer Specification
Complements Part A. On ambiguity or conflict, do not invent behavior; go back to the project owner.

### 22. Binding instructions for AI and developer
- The functional requirements here are the only reference for the MVP. Do not add functions or workflows just because they are common elsewhere.
- Do not change the meaning of any business rule while improving UX or refactoring.
- Any unspecified functional decision affecting operations, permissions, data or reports is an Open Question for the owner.
- Separate business logic from UI.
- Build to be extensible without complicating V1.

### 23. Data dictionary
| Term | Definition |
|---|---|
| Project | Main work record: establishment, maintenance, modification or other. |
| Visit | Field visit with a date and supervisor, linked to a project. |
| Task | Specific work to execute and track. |
| Checklist Item | Inspection/verification item in a predefined list by project type or stage. |
| Recurring Task | Maintenance task repeating on a schedule; system keeps last execution and next due. |
| Follow-up Task | Unclosed task needing later follow-up. |
| Labor Allocation | Record loading a worker onto a project/visit on a date at 1.0 or 0.5 day. |
| Checklist Template | Admin-editable template defining inspection items or periodic tasks without code. |
| Month Close | Locking a month's labor data, blocking supervisor edits afterwards. |

### 24. Single source of truth
- The visit's Labor Allocation **is** the record used in finance reports; no second copy.
- Task status is stored in one Task record and re-displayed in visit or report; no conflicting copies.
- The project is the reference for its visits, tasks, photos, labor and reports.
- Derived dashboard/report data is computed from source records, not stored manually.

### 25. Configuration over code
Admin-manageable, not hard-coded: project types; work types; checklist templates; new-project stages; periodic maintenance items and frequency; active/inactive status of projects and workers; languages and translatable texts.

### 26. Business rules
| ID | Rule |
|---|---|
| BR-001 | Sum of a worker's Labor Allocation on the same date must not exceed 1.0. |
| BR-002 | MVP durations are 1.0 (full) or 0.5 (half) only. |
| BR-003 | 0.5 + 0.5 on two different projects/visits is allowed; any sum above 1.0 is rejected. |
| BR-004 | Selecting several workers at once creates a separate record per worker. |
| BR-005 | Closing a visit does not auto-close any Task with status NEEDS_FOLLOW_UP. |
| BR-006 | A NEEDS_FOLLOW_UP task stays open and appears in follow-up/next visit until closed. |
| BR-007 | Changing supervisor does not delete or recreate project, visit or task history. |
| BR-008 | A completed/closed project is not deleted; its data stays searchable. |
| BR-009 | After Month Close a supervisor cannot edit that month's Labor Allocation. |
| BR-010 | Any exceptional post-close edit needs higher permission and is written to the Audit Log. |
| BR-011 | A Recurring Task keeps at least the last execution date and next due date. |
| BR-012 | Photos are not mandatory per Task; requirement is set by Checklist/Task configuration. |
| BR-013 | The visit report is generated from visit, task and photo data with no re-entry. |
| BR-014 | No hard delete of completed operational or financial records; use Archive/Deactivate/Void. |
| BR-015 | Project/visit/task/worker carry a stable internal ID independent of the display name. |

### 27. State machines
| Entity | Allowed states |
|---|---|
| Project | ACTIVE → ON_HOLD → COMPLETED/CLOSED |
| Visit | PLANNED → IN_PROGRESS → COMPLETED |
| Task | OPEN → COMPLETED, or OPEN → NEEDS_FOLLOW_UP → COMPLETED |
| Month | OPEN → CLOSED |
| Employee / Supervisor | ACTIVE → INACTIVE |

No new states without approval. Internal technical states must not change the operational meaning.

### 28. Mandatory vs optional fields
| Record | Mandatory | Optional |
|---|---|---|
| Project | Name, type, status | Extra notes |
| Visit | Project ID, date, supervisor, status | Notes |
| Task | Description, status, Project/Visit reference | Photo/note unless the template makes it mandatory |
| Labor Allocation | Date, Employee ID, Project/Visit ID, Duration, Supervisor ID | Notes |
| Task Photo | Task ID, Before/After type when used | Extra photos |

### 29. Permission matrix
| Operation | Manager/Admin | Supervisor | Finance |
|---|---|---|---|
| Create & manage projects | Create/edit | — | View |
| Create tasks & checklists | Create/edit | View assigned | View |
| Execute tasks | Execute/update | Execute/update | — |
| Labor allocation | Create/edit | Create/edit before close | Review |
| Month close | Per permission | — | Close/review |
| Operational reports | Full view | Own projects | View |
| Excel / PDF | Export | Per permission | Export |
| Edit after close | Special permission | — | Special permission |

Finance may be merged with Administrator in V1 if simpler, provided Month Close permission stays clear and protected.

### 30. Audit trail and no deletion
- Important records store created_by, created_at, updated_by, updated_at.
- Sensitive edits (e.g. Labor Allocation after close) store old value, new value, reason, user and time.
- No hard delete for completed visits, completed tasks, Labor Allocation, or approved reports.
- Use Cancel/Void/Archive with a reason, preserving history.

### 31. Edge cases
| Case | Expected behavior |
|---|---|
| Supervisor forgot to complete the visit | Visit stays IN_PROGRESS and shows as unclosed until completed or closed by an authorized user. |
| Worker moved between two projects same day | 0.5 to the first, 0.5 to the second; further loading blocked. |
| Supervisor on leave / replaced | Project/visit reassigned; new supervisor sees full history and open work. |
| Closing a project with an open Task | No final close until the task is handled or an exception approved by higher permission; task never disappears. |
| Recurring Task not done on time | Stays due/overdue and appears in next follow-up; never auto-marked done. |
| Two supervisors load the same worker concurrently | Conflict shown, exceeding 1.0 blocked; no last-write-wins. |
| Internet drop while saving | No data loss; if full offline isn't supported, show save failure clearly — never pretend it saved. |
| Worker becomes Inactive with past records | History keeps name and ID; only hidden from future lists. |

### 32. Acceptance tests
| ID | Scenario | Expected |
|---|---|---|
| TC-01 | Worker at 1.0 on project A, then add 0.5 on B same date | Rejected; original unchanged. |
| TC-02 | Worker 0.5 on A then 0.5 on B | Both accepted; day total = 1.0. |
| TC-03 | Select 8 workers at once, one project, 1.0 | 8 separate Labor Allocation records. |
| TC-04 | Fertilizing task = NEEDS_FOLLOW_UP, then complete visit | Visit closes; task stays open and shows next time. |
| TC-05 | Change supervisor of existing project | New supervisor sees previous visits, tasks, photos and open work. |
| TC-06 | Recurring task due today | Appears as required; not done until actually updated. |
| TC-07 | Close month, supervisor edits an allocation | Rejected. |
| TC-08 | Authorized user edits after close | Allowed with Audit Log and reason. |
| TC-09 | Complete visit with photos, done tasks and follow-ups | Report reflects recorded data, no re-entry. |
| TC-10 | Delete a closed project with history | No hard delete; stays saved and searchable. |
| TC-11 | Worker unallocated on a workday | Appears in unallocated list. |
| TC-12 | Two supervisors save concurrent loads pushing worker over 1.0 | Only one succeeds; BR-001 holds. |

### 33. Technical guardrails
Responsive web app, mobile first; API-based architecture separating frontend, business logic and data layer; relational DB with constraints/transactions protecting critical rules (esp. worker load sum); RBAC; HTTPS in production, hashed passwords; organized reversible migrations; staging separate from production; periodic backups of data and photos with tested restore; photos in object storage with references/metadata in DB, never Base64 in tables; RTL and Arabic from day one; transactions/locking against race conditions in Labor Allocation; no secrets in code or repo; automated tests for BR-001…BR-015 and the core TCs.

### 34. Non-functional requirements
- Supervisor can register a crew and start a visit in under one minute.
- Field screens readable on a phone without zooming.
- Every save shows clear success or failure.
- Long worker/project lists support fast search.
- Monthly reports filterable by period, project and worker.
- History never uses changeable names as join keys.

### 35. Non-goals (forbidden MVP expansion without explicit approval)
Payroll; accounting/journal entries; invoicing/collection; full CRM; purchasing/inventory; continuous GPS/geofencing; biometric attendance; advanced Gantt/planning; internal chat; advanced document management; AI vision for photo quality or automatic technical decisions.

### 36. Questions to settle before go-live (not before prototype)
1. Who actually owns Month Close permission in production?
2. Does the client report need in-app e-signature from V1, or is a signature space in the PDF enough?
3. Is closing a Project with open tasks fully blocked, or is an Administrator override with reason allowed?
4. What are the final approved checklists per project type and stage?
5. What are the actual maintenance frequencies per item, and do they vary by contract/site?
6. What worker-cost policy will finance use to convert days to actual cost?

These must not be decided automatically by the developer or AI.

### 37. MVP definition of done
All core acceptance tests pass; no supervisor path can push a worker above 1.0 day; follow-up tasks survive visit close; supervisor change keeps project history; checklists and periodics editable without code; visit report generated from actual data; labor reports exportable to Excel; month close blocks unauthorized edits; works on phone and desktop with RTL.
