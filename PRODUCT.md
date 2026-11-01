# Product

<!-- impeccable:product-schema 1 -->

<!-- Written from the repository, docs/ and the design plan. Nothing here was confirmed in an interview; items marked (inferred) are read from code and copy and should be corrected by the owner if wrong. -->

## Platform

web

## Users

Three roles, all employed by or serving **Ghsoon Najd** (غصون نجد), a field-service business:

- **Manager.** Runs the business from a phone or a laptop. Creates tasks from templates, assigns one or more workers, schedules visits (including recurring ones), manages clients, team members and templates, reviews submitted work, approves or rejects it, and reads the audit log and reports.
- **Worker.** In the field, on a phone, often outdoors and one-handed. Sees only their own tasks, works through the checklist, takes start and finish photos, logs extra work, adds notes and submits the task for approval.
- **Client.** The customer whose site is serviced. Approves finished work through a signing link (no account) or watches visits and approved work in a read-only portal. May sign on a phone.

Some Urdu-speaking workers use the app (the glossary in `docs/urdu-glossary.md` uses their own words, e.g. "ورکر", "وزٹ").

## Product Purpose

Make field work checkable and signed off. A manager defines what a visit consists of (a template), a worker proves it was done (checklist, photos, time on task, signature), and the client confirms it. Success is a task that moves not started, in progress, submitted, approved with proof attached and nobody chasing anyone on WhatsApp.

## Positioning

A checklist-and-proof tool built around the way Ghsoon Najd actually works: Arabic first, right-to-left, phone first, offline-tolerant, with the client's signature or an explicit "auto-approved, client did not respond" state as the closing step.

## Operating Context

- Installed as a PWA on phones; also used in a desktop browser (side navigation appears from 1024px).
- Workers capture photos and signatures on-site, sometimes with poor connectivity: the app states that it works offline and syncs when back online.
- Clients receive a signing link by WhatsApp or email and open it on their own phone, usually without ever having seen the app.
- Language is chosen per user and applies to the app and the report: **Arabic (default, RTL)**, **English**, **Urdu (RTL, Nastaliq script)**. Urdu number fields use Latin digits.
- Hosting: Supabase backend, static front end on GitHub Pages. A demo mode (`VITE_DEMO_MODE=1`) runs on in-browser seed data and lets any email sign in.

## Capabilities and Constraints

- Task statuses: not started, in progress, submitted, approved, rejected. Approval is either a real client signature, a manager approval, or auto-approval after the signing window elapses; auto-approval must never look like a signature.
- Tasks: templates, recurrence, multiple workers, job location (map link, coordinates), extra work entries, proof photos and notes, audit log, notifications, PDF report.
- Constraints to preserve: RTL correctness for Arabic and Urdu; Urdu Nastaliq needs extra line height; 44px minimum touch targets; visible keyboard focus; AA contrast; all strings come from i18n (en, ar, ur); no new claims or features in design work.
- Undecided: none recorded.

## Brand Commitments

- Name: **Ghsoon Najd** / غصون نجد. Logo: a two-leaf sprout glyph in emerald on deep forest, with a small gold arc.
- Colours (binding): ink `#003C1B` (text and primary actions), emerald `#00C481` (logo and accents on dark surfaces only), accent `#00704A`.
- Typefaces in use: Geist (Latin), Cairo (Arabic), Noto Nastaliq Urdu (Urdu).

## Evidence on Hand

- `docs/urdu-glossary.md` and `docs/urdu-review.csv` (Urdu terminology and review state), `docs/whatsapp-templates.md`, `docs/LAUNCH.md`.
- Demo seed data in `src/services/storage/seed.ts`. There are no customer testimonials, logos, statistics or press; none should be invented.

## Product Principles

1. The task being run and the approval being asked for are the most important things on any screen; everything else supports them.
2. Status is shown by colour and word together, never colour alone.
3. A worker with one hand free and the sun on the screen can use every primary action.
4. Every language is a first-class layout, not a translation of the English one.
5. Say what happened and what to do next in the user's own language; no jargon, no invented reassurance.

## Accessibility & Inclusion

- 44px minimum targets, visible focus on every interactive element, AA contrast for text, status never by colour alone, `prefers-reduced-motion` honoured.
- Arabic and Urdu: no letter-spacing, logical CSS properties only, mirrored directional icons, isolated Latin runs (emails, numbers).
