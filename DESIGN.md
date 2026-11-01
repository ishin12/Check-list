---
name: Ghsoon Najd Check-list
description: A calm, flat, forest-green field-work app that reads the same in Arabic, Urdu and English.
colors:
  ink: "#003C1B"
  ink-hover: "#0D4B27"
  ink-press: "#002B13"
  emerald: "#00C481"
  accent: "#00704A"
  accent-soft: "#CFE9DA"
  page: "#EBF0E9"
  page-deep: "#E0E7DE"
  surface: "#FFFFFF"
  surface-2: "#E1E9DF"
  surface-3: "#D2DDD0"
  surface-4: "#C4D1C1"
  text-muted: "#4A6357"
  field-border: "#829683"
  disabled-bg: "#E4EAE2"
  disabled-fg: "#6A766F"
  danger: "#8E2222"
  danger-soft: "#F7D9D9"
  success: "#0B5B2D"
  success-soft: "#CBEBD6"
  gold: "#C9A14A"
  gold-soft: "#F6E4B8"
  status-not-started-bg: "#DDE5DB"
  status-not-started-fg: "#3D5446"
  status-in-progress-bg: "#F6E4B8"
  status-in-progress-fg: "#6E4200"
  status-submitted-bg: "#D3E4F5"
  status-submitted-fg: "#1C4E80"
typography:
  display:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  list-title:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.35
  meta:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  tab-label:
    fontFamily: "Geist, Cairo, Noto Nastaliq Urdu, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  tag: "6px"
  control: "8px"
  surface: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-4}"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "16px"
  card-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "16px"
  hero:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "48px"
  status-tag:
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    height: "68px"
---

# Design System: Ghsoon Najd Check-list

## Overview

**Creative North Star: "The Signed-Off Checklist"**

The interface behaves like a well-kept paper checklist that has learned to be a phone app: one task at a time, plain words, firm marks. Everything is flat. Surfaces are told apart by a step in tone, not by outlines or shadows, so the screen stays calm in direct sun and the one thing that matters on each screen (today's visit, the task being run, the approval) is the one thing with weight.

It is an Operate surface: scanability, consistency and a thumb's reach outrank expression. Brand shows in details, not decoration: the deep forest ink on every primary action, the sprout mark, the green tint that quietly tells you where you are. The same layout serves Arabic, Urdu and English; RTL is the design, English is the mirror.

**Key Characteristics:**
- Flat by default: white cards on a pale green page, no outlines, no resting shadows.
- One ink, one accent. Emerald lives on the logo and on dark fields only.
- Two corner radii (8px things you touch, 12px things that hold them) plus 6px tags.
- Five type sizes, left-aligned, ink-coloured running text, tabular figures.
- Status is a fill colour plus a word, never a dot or an outline.

## Colors

A forest-tinted neutral ramp with one accent and four semantic hues. Every neutral is tinted toward the brand green; there is no pure grey.

### Primary
- **Deep Forest Ink** (#003C1B): all running text, headings, primary buttons, the hero field, checked boxes. Its hover (#0D4B27) and press (#002B13) steps are the only dark variations.
- **Fresh Sprout Emerald** (#00C481): the logo glyph and accents on dark surfaces only. Never text on light, never a button.

### Secondary
- **Field Green** (#00704A): links, active tab, small icons, the progress fill, the caret. Passes AA for text on white and on the page (5.3:1 on the page).
- **Soft Field Green** (#CFE9DA): the tone step for "selected" and "up next": the active tab indicator, the leading card, unread notifications, the demo chip.

### Neutral
- **Page** (#EBF0E9): the app background and the sticky header (same tone, so no rule under it).
- **Page Deep** (#E0E7DE): desktop backdrop and the public Sign page behind its white card.
- **Surface** (#FFFFFF): cards, bars, sheets, form fields.
- **Surface 2** (#E1E9DF): tiles inside cards, tracks, empty-state tiles, the desktop account block.
- **Surface 3** (#D2DDD0): secondary button fill, count and repeat tags, language toggle track.
- **Surface 4** (#C4D1C1): hover and press on surface-3 only.
- **Muted Forest** (#4A6357): secondary notes and meta lines, 5.7:1 on the page. Running text is never muted.
- **Field Border** (#829683): the outline of real form fields and checkboxes only (3.2:1).

### Semantic
- Danger #8E2222 on #F7D9D9, success #0B5B2D on #CBEBD6, and a status set (not started grey, in progress amber, submitted blue, approved green, rejected red) each at 6:1 or better on its own fill.
- Gold (#C9A14A, soft #F6E4B8) is reserved for notes and the "auto-approved, no client response" marker.

### Named Rules
**The Tone-Step Rule.** Separate surfaces by stepping tone: page, then white card, then surface-2 tile inside it. If a box needs an outline to be seen, the tone steps are wrong.
**The One Voice Rule.** Emerald appears only on the logo and on dark fields. Everything interactive on light is ink or field green.
**The Not-A-Signature Rule.** The dashed gold outline is the one outline in the system outside form fields. It marks auto-approval so it can never be mistaken for a client's signature.

## Typography

**Display / Body Font:** Geist (Latin), with Cairo for Arabic and Noto Nastaliq Urdu for Urdu, loaded from Google Fonts in `index.html`.

**Character:** Plain, confident and legible at arm's length. Weight does the work that size does elsewhere: list titles are body size in bold, one display line per screen is large.

### Hierarchy
- **Display** (700, 1.75rem/28px, 1.2, -0.02em): the one line that leads a screen: greeting in the hero, the Sign page title. Wraps to two lines at most.
- **Heading** (700, 1.25rem/20px, 1.25, -0.02em): page titles in the header, section headings, dialog titles, the date line on a task, the leading "up next" card title.
- **Body** (400, 1rem/16px, 1.5): all running text, buttons (600), inputs. Measure stays under about 65ch because the content column is capped at 560px on a phone and 960px on desktop.
- **List title** (700, 1rem/16px, 1.35): card and row titles.
- **Meta** (600, 0.875rem/14px): field labels, status and count tags, secondary lines (colour muted).
- **Tab label** (600, 0.75rem/12px): bottom tab labels and map coordinates only. There are six tabs on a 390px screen.

### Named Rules
**The Five Sizes Rule.** 12, 14, 16, 20, 28. A new size needs a reason that these cannot give; the answer is usually weight.
**The No-Tracking-In-Arabic Rule.** Negative tracking applies to Latin only; `--tracking-tight` is `0` under `dir=rtl`. Arabic and Urdu are never tracked or uppercased.
**The Latin Digits Rule.** Number fields use the Latin face and line height even in Urdu, so Nastaliq metrics cannot clip them. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body).

## Layout

Phone first: a single column, 16px side padding, capped at 560px and centred on larger screens. At 1024px the bottom tab bar is replaced by a 260px side rail and the content column widens to 960px with 32px padding; the agenda becomes two columns.

**Spacing scale (4px base):** 4, 8, 12, 16, 24, 32, 48. Inside a group (a list of cards, the fields of a form) the gap is 12. Between groups the page gap is 24. A section heading sits 8px above its list and about 32px below the previous group, so it belongs to what follows. Use 48 only for the loosest breaks.

**Structure:** header (page tone, title at start, language and demo controls at end), main, optional sticky action bar (one primary action, widest), bottom tab bar. All sizing uses logical properties (`inline`, `block`, `start`, `end`) so one stylesheet serves LTR and RTL; directional icons carry `icon--dir` and mirror.

**Urdu:** Nastaliq has tall ascenders and a diagonal baseline, so line height, button padding and the tab bar height (84px) grow under `html[lang='ur']`. Nothing in the shared layer may fix a line box without an Urdu override.

**Hit targets:** 44px minimum (48px for buttons and fields); 76px for the camera shutter.

## Elevation & Depth

Flat. Depth is conveyed by tone: page, white card, tile. Nothing at rest carries a shadow. Only layers that physically float over content carry one, and each says so in the stylesheet:

### Shadow Vocabulary
- **Float** (`0 8px 24px rgba(0, 43, 19, 0.16)`): menus (demo switcher) and the confirm dialog.
- **Bar** (`0 -6px 20px rgba(0, 43, 19, 0.07)`): the sticky action bar and the fixed tab bar, so content scrolling under them is read as being under them. It is removed when the action bar becomes an in-flow panel on desktop.

### Named Rules
**The Flat-At-Rest Rule.** If it does not overlap scrolling content, it has no shadow and no outline.

## Shapes

**One button radius: 8px.** Buttons, inputs, selects, list rows, check items, the tab indicator, menus and tiles inside cards all use it. Cards, the hero, the dialog and empty-state tiles hold them at 12px. Tags (status, repeat, count, badge) and the checkbox use 6px. Full round is for dots, the progress track, the sign-off check circle and the shutter, nothing else.

Real form fields (inputs, textareas, selects, the worker list, the signature pad's dashed box, checkboxes) keep a 1px or 2px outline in Field Border, because that outline is what says "type here". Nothing else is outlined.

## Components

### Buttons
- **Shape:** 8px radius, 48px high (44px small, 56px large), 600 weight, 16px label, no border.
- **Primary:** forest ink fill, white text. One per screen where possible; in an action bar it takes twice the width of its companions.
- **Secondary (default) and ghost:** Surface 3 fill, ink text. `btn--ghost` is kept as an alias so existing markup renders the same as secondary.
- **Text:** no fill, field green label; fills surface-2 on hover.
- **Danger:** soft red fill, dark red text.
- **Hover / Active:** one tone step darker; active also scales to 0.98. **Disabled:** neutral grey fill and grey text, never a pale primary.
- **Focus:** 3px field-green ring, 2px offset, everywhere (white on camera and viewer).

### Cards / Containers
- **Corner Style:** 12px. **Background:** white on the page. **Padding:** 16px. No border, no shadow.
- **Tap cards** darken one step on hover and press. **Accent card** (soft field green) leads a screen and takes the heading size for its title. **Unread** uses the same tint.
- Cards never nest. Inside a card, groups are tiles (surface-2, 8px) or just spacing.

### List rows (check items, timeline items)
White, 8px radius, 56px minimum height, no outline. A done item takes the soft green tint. A required item that is still open is marked by its ink "required" badge, not by a border.

### Status and tags
A 6px-radius tag with a fill and a word. No dot, no outline. Auto-approved is the dashed-gold exception (see rules). Repeat and count tags use surface-3.

### Inputs / Fields
- **Style:** white fill, 1px Field Border, 8px radius, 48px high, 16px text so iOS does not zoom. Labels sit above in meta size, ink, 600.
- **Focus:** 3px field-green outline and border. **Disabled:** grey fill, no border. **Error:** red text under the field plus a red banner for form-level errors.

### Navigation
- **Bottom tab bar (phone):** fixed, white, up to six tabs, icon over a 12px label. Active = soft green 56x32 indicator behind the icon, field-green label, bolder weight. 68px high (84px in Urdu).
- **Side rail (desktop):** 260px, white, brand mark, one primary "Add task" for managers, tab list with the same active treatment, account block at the foot on a surface-2 tile.
- **Header:** page tone, 20px bold title with a two-line clamp, back chevron (mirrored in RTL), demo chip and language toggle at the end.

### Sheets, dialogs and empty states
- **Dialog:** white, 12px, 24px padding, max 360px, one heading, body in ink, two equal buttons (cancel secondary, confirm primary or danger), scrim in dark forest at 50%.
- **Empty state:** a surface-2 tile, 12px, start-aligned, icon in field green, one sentence, one action if there is one. Not centred, not in a circle.
- **Camera and photo viewer:** full-screen black, white controls, the only places the system goes dark.

### Language toggle
A surface-3 track, 8px, with the active language filled ink. No outline.

## Do's and Don'ts

### Do:
- **Do** separate a card from the page by tone (white on #EBF0E9) and a tile from its card by tone (#E1E9DF).
- **Do** use ink (#003C1B) for running text; use muted (#4A6357) only for secondary lines and meta.
- **Do** keep one primary action per screen, in the thumb zone, as a forest fill.
- **Do** build with logical properties and test every screen in Arabic and Urdu as well as English.
- **Do** show status as fill plus word; show required and done states as fill and badge.
- **Do** keep outlines on real form fields and on the dashed "not a signature" marker.

### Don't:
- **Don't** add kickers or small labels above headings. Fold the information into the heading or the first line.
- **Don't** use emoji or ASCII glyphs as icons; use the drawn set in `Icon.tsx`.
- **Don't** put a 1px border, a hairline divider or a resting shadow on a card, bar, row or chip.
- **Don't** use 999px radii on buttons or tags; keep the three radii.
- **Don't** introduce gradients, glass or blur, or a sixth type size.
- **Don't** use `100vh`; use `100dvh`.
- **Don't** letter-space or uppercase Arabic or Urdu, and don't fix a line height in the shared layer without an Urdu override.
- **Don't** use emerald (#00C481) for text or buttons on light surfaces.
