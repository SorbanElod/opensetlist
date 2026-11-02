# Design notes — OpenSetlist web

The design tokens live in `web/src/index.css` (`@theme`), which Tailwind v4
turns into utilities (`bg-bg`, `text-muted`, `border-border`, …). This file
records the decisions and their rationale — every choice below should be
defensible as "we chose X because Y".

## Palette (dark = default, stage use)

| token         | hex     | use                                                            |
| ------------- | ------- | -------------------------------------------------------------- |
| bg            | #090D0B | page background                                                |
| surface       | #0E1412 | card / surface                                                 |
| raised        | #141B17 | raised / hover                                                 |
| border        | #1F2A24 | hairline border                                                |
| border-strong | #2C3A32 | hover border                                                   |
| text          | #F2F3F5 | primary text                                                   |
| muted         | #A4AAB4 | muted text                                                     |
| subtle        | #666C76 | subtle text                                                    |
| accent        | #3ECF8E | the ONE accent (green): primary actions, active states, chords |
| on-accent     | #0A1A12 | text on accent fill                                            |
| error         | #E5776F | errors                                                         |

Light theme (toggle in the shell + auth pages, OS `prefers-color-scheme` as
the initial default, dark fallback): bg #F4F7F3 / surface #FCFEFB / raised
#EBF0EA, border #DFE7DE / #CCD6CB, text #191A1D, muted #5E636D, subtle
#9A9FA8, accent #157A52, on-accent #FFFFFF, error #C7483F.

**Why this palette:** the primary device is a phone on stage, so dark is the
default and the accent is a single "go/play" green. The neutral ramp carries
a faint green cast (issue #56) so the accent reads as part of the system
rather than pasted on gray — the earlier pure-gray neutrals made the theme
look generic. One accent only; no gradients on surfaces.

## Type

Inter Variable only (self-hosted via `@fontsource-variable/inter`,
offline-friendly). Scale: 22/700 screen title · 14/600 row title · 13/400
body · 11.5/500 meta · mono for keys/BPM/ABC. A display font for the wordmark
and screen titles was considered and rejected (issue #56): no new font
dependencies in the MVP — Inter at 700 with tight tracking carries the titles.

## Rules of thumb (v2 — the "human pass", issue #56)

- One radius scale, deliberately sharp: **panels 8px** (`.card`, `.list`,
  menus, banners), **controls 6px** (`.btn`, `.input`, chips, segmented),
  list rows square. The earlier 10–16px radii everywhere read generated.
- Lists are ONE panel with hairline-divided rows (`.list` + `.list-row`),
  not a wall of individual rounded cards.
- 4px spacing grid; one accent color only; borders over shadows in dark;
  hairline 1px borders; tap targets ≥ 40px on mobile (we use 44px)
- navigation: a sticky top header on all screen sizes; the active route gets
  a 2px accent underline along the header's bottom edge. The mobile bottom
  tab bar from the early sketch was NOT adopted — the app has two primary
  destinations, a header is simpler and works in landscape on stage.
  Revisit when setlists (#12) add a third destination.
- numbers (dates, BPM, keys) use `tabular-nums`; keys render as an
  accent-tinted mono chip

## Components

CSS utilities in index.css: `.card` (panel: surface + border + 8px),
`.list` / `.list-row`, `.btn` + `.btn-primary`/`.btn-outline`/`.btn-ghost`
(`.btn-block`), `.input` (focus ring = accent-soft), `.flabel` (uppercase
11.5px), `.field`, `.field-error`, `.error-banner`. Segmented control (the
Sheet | Chords | Lyrics view toggle) is an inline-flex button group.

Shared React components (`web/src/components/`) — every page composes these
instead of ad-hoc markup: `PageHeader` (title + subtitle + actions),
`ListRow` (one list-row pattern for songs and arrangements), `EmptyState`
(message + optional CTA), `ArrangementRenderer` (the one section-render
pipeline), `LogoMark`, `AppShell`, `ThemeToggle`.

## Decisions taken

- Icons: `lucide-react` — React standard, ISC, tree-shakeable.
- Logo mark: hand-drawn inline SVG — three staff lines with an eighth note in
  the accent (`LogoMark` component), not a colored tile with an icon glyph
  (issue #56).
- Active nav item carries a 2px accent underline along the sticky header's
  bottom edge (issue #56) — the one signature accent moment in the shell.
- framer-motion NOT adopted: transitions are plain CSS. Revisit for the P3
  live view.
- Screens beyond auth (home dashboard / library / song / editor / setlists)
  map to P2.1–P3 issues; the home dashboard content lands with P3 (#12/#13).
