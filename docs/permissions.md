# Account roles and permissions

The database role `manager` is the administrator account for compatibility with existing users. The UI labels it **Administrator**.

| Role | Purpose | Access | Cannot do |
| --- | --- | --- | --- |
| Administrator (`manager`) | Own the workspace | All features, users, clients, tasks, templates, approvals, reports and audit | — |
| Worker (`worker`) | Perform assigned field work | Assigned tasks, task updates, proofs, notes, notifications and own report | Manage users, clients, templates, approvals or audit |
| Accountant (`auditor`) | Independent read-only oversight | Operational reports, audit history and read-only task/client/proof/note data | Change data, approve tasks, invite users or manage settings |
| Client (`client`) | External customer portal | Own portal records and password change | Internal operations and other clients |

The changeable source of truth is `src/domain/permissions.ts` for the UI and `public.has_permission` in migration `0008_auditor_permissions.sql` for database enforcement.

The auditor report is intentionally operational: task totals, approval/completion status, recent work and CSV export. The current schema has no invoices, amounts, payments or costs, so this release does not claim to provide monetary accounting.
