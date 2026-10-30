# Design notes — extracted from the Vibe-chat mockup (v0.1)

Source: the interactive React mockup drafted in Vibe chat (P2 focus, P3 preview).
Adopted into the real app as CSS tokens in `web/src/index.css` (`@theme`), which
Tailwind v4 turns into utilities (`bg-bg`, `text-muted`, `border-border`, …).

## Palette (dark = default, stage use)

| token     | hex     | use                                                            |
| --------- | ------- | -------------------------------------------------------------- |
| bg0       | #0A0B0E | page background                                                |
| bg1       | #101216 | card / surface                                                 |
| bg2       | #171A20 | raised / hover                                                 |
| bg3       | #1E2229 | inset                                                          |
| bd        | #22262F | hairline border                                                |
| bd-strong | #303542 | hover border                                                   |
| t1        | #F2F3F5 | primary text                                                   |
| t2        | #A4AAB4 | muted text                                                     |
| t3        | #666C76 | subtle text                                                    |
| acc       | #3ECF8E | the ONE accent (green): primary actions, active states, chords |
| on-acc    | #0A1A12 | text on accent fill                                            |
| err       | #E5776F | errors                                                         |

Light theme (shipped from P2.0: toggle in the shell + auth pages, OS
`prefers-color-scheme` as the initial default, dark fallback): bg #F6F6F4/#FFFFFF/#EFEFEA,
bd #E5E5DF/#D5D5CC, t1 #191A1D, t2 #5E636D, t3 #9A9FA8, acc #157A52, on-acc #FFFFFF, err #C7483F.

## Type

Inter (self-hosted via `@fontsource-variable/inter`, offline-friendly). Scale:
22/700 screen title · 14/600 row title · 13/400 body · 11.5/500 meta · mono for keys/BPM/ABC.

## Rules of thumb (from the mockup)

- 4px spacing grid; radii: 10px controls, 12–16px cards, 999px chips
- one accent color only; borders over shadows in dark; hairline 1px borders
- tap targets ≥ 40px on mobile (we use 44px)
- mobile: bottom tab bar (Home / Songs / center + / Setlists) — lands with P2.1
- desktop: 228px sidebar with logo, group switcher, nav, theme toggle, user card

## Components (in index.css as plain classes)

`.card`, `.btn` + `.btn-primary`/`.btn-outline`/`.btn-ghost` (`.btn-block`),
`.input` (focus ring = accent-soft), `.flabel` (uppercase 11.5px), `.field`,
`.field-error`, `.error-banner`. Chips/segmented controls land with P2.1/P2.4.

## Decisions taken

- Icons: `lucide-react` (not the mockup's nucleo-sharp) — React standard, ISC, tree-shakeable.
- Logo mark: green rounded square + music-note icon (`LogoMark` component).
- framer-motion NOT adopted: its transitions are plain CSS here. Revisit for P3 live view.
- Screens in the mockup beyond auth (home/library/song/editor/setlists) map to P2.1–P3 issues.
