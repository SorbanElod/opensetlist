# AGENTS.md — OpenSetlist

Context file for the AI coding agent. **Read at the start of every session, before doing anything else.**
Maintained by Előd Sorbán. Last updated: 2026-10-31.

## Project context

OpenSetlist is a multi-tenant SaaS for worship planning and gig management: songs, musical arrangements in **ABC Notation**, setlists, and role-based rendering (chords / lyrics views) for church bands. It is also a **master's thesis project** (Enterprise Software Design and Development, BBTE Cluj).

Two consequences for every session:

1. **Boring beats clever.** Industry-standard patterns only. Every line must be defensible in a thesis defense — if you can't explain a line simply, don't write it.
2. **It's an MVP.** Target: alpha with a real worship team by mid-Feb 2027, thin vertical slice (single group: songs → arrangements → setlists → role-based rendering). Deferred features are *thesis chapters*, not TODO creep. Don't gold-plate.

## Locked stack — do not substitute

- **Language:** TypeScript everywhere, `strict: true`
- **API:** Fastify + Zod (validation at the edges)
- **DB:** PostgreSQL + Drizzle ORM. **Prisma is off the table** (owner's past bad experience). Keep SQL visible — no query black boxes.
- **Web:** React + Vite. Mobile-first, dark mode from day one (phones on stage are the primary device).
- **ABC rendering:** abcjs
- **Monorepo:** pnpm workspaces, `api/` + `web/`. No monorepo tooling (Turborepo etc.) unless needed.
- **Jobs:** pg-boss (Postgres-backed) if async appears early. **No Redis, no RabbitMQ in the MVP.**
- **Live updates:** Socket.IO inside the monolith, per-group rooms, notify-only events + client refetch (no OT/CRDT diff sync). Fallback: refetch-on-focus + slow poll.

## Architecture principles

- **Single-Source, Multi-View:** music lives as ABC Notation text; the DB holds the "Arrangement Math" (keys, BPM, sequence); the frontend derives role-based views from one source. Never fork content per view.
- **Songs vs Arrangements:** Songs are abstract identity + metadata (title, authors, visibility, owner). Arrangements are musical variants of a song (original key, BPM, default sequence, sections with ABC content).
- **Data model (P1 target, 10 tables):** `users`, `sessions`, `groups`, `group_members`, `songs`, `arrangements`, `setlists`, `setlist_items` (child table, NOT an embedded array), `tags` (group-scoped, name unique per group, lowercase-normalized), `song_tags` (junction). No `ccli_number` — CCLI was dropped from scope.
- **Optimistic locking:** every mutable entity carries a `version` integer. Updates check and bump it.
- **Modular monolith.** Satellites (OpenLP export, AI import) are thesis-phase, consume the API, never the DB.

## Roles & authorization (final model)

Two axes:

- **Platform axis:** superadmin via `users.is_superadmin` (supports every group, bypasses group checks — never a `group_members` role).
- **Group axis:** `group_members.role` ladder: `group_manager` ⊃ `member` (edit songs, arrangements AND setlists by design) ⊃ `reader` (read-only guest).

Rules:

- ALL permission checks funnel through **one `authorize()` middleware choke point**. No ad-hoc role checks in route handlers. (Thesis phase swaps in a capability-ACL dictionary *beneath* the same roles — keep the choke point so that swap is internal-only. `group_members.role` never migrates.)
- Guard against **last-group-manager lockout** on role changes/removals.
- MVP = hard-coded role enum checks. Do NOT build the capability ACL now.

## Workflow rules (non-negotiable)

1. **One GitHub issue = one branch = one PR.** Branch name: `feat/p<phase>-<slug>` (e.g. `feat/p1-7-session-auth`). Pull the issue with `gh issue view <n>` before coding.
2. **Trunk-based:** short-lived branches off `main`, PR back. `main` is always green.
3. **Conventional commits**, small and often — each commit is an undo point.
4. **PR description ends with `Closes #<issue number>`.**
5. **Never commit secrets or `.env`.** `.env.example` with dummy values only. (The CLI guards `.env` reads/writes — don't fight it.)
6. **Add warranted dependencies from the start, not as retrofits** — if a dep is needed now or will clearly be needed in the next phase, give a brief pro/contra and add it once approved (P2.0 precedent: react-router, Tailwind v4, jsdom + Testing Library). Hard-banned in the MVP regardless: Redis, RabbitMQ, Prisma, MongoDB, any microservice split. New *infrastructure* always needs asking first.
7. **Plan before execute:** show the file tree / dependency list and wait for approval before writing code on anything non-trivial.
8. **Agent writes tests; Előd runs them.** Tests are part of the work, not an afterthought.
9. **Postman collection stays current.** `postman/OpenSetlist.postman_collection.json` is the browsable API contract: any PR that adds or changes an endpoint updates the collection in the same PR — request, expected status codes, and example responses.
10. **Keep the "Current phase" section below current: update it in the same session, right after every PR is created.** The issue board and this file must not drift (P2.0/P2.1 went stale exactly this way once).

## Collaboration expectations

Elød is learning most of this stack (first serious PostgreSQL, first AI-assisted project; background is copy-pasting from AI chats). Therefore:

- Prefer **explicit and readable** over clever abstractions. SQL visible, magic minimal.
- When introducing a concept Elød may not know (a Drizzle pattern, a Postgres feature), add a one-line "why" — he must be able to defend it later.
- **Division of labor:** the agent does the work end-to-end — implementation, tests, commits, PRs. Előd reviews each PR, does additional manual testing, and gives approval before merge.
- When blocked between two reasonable options, present the tradeoff briefly instead of silently picking.

## Current phase

P2 — Song library (done: `#28` auth UI shell, `#8` songs CRUD, `#9` arrangements + ABC editor; `#20` tags is up as PR #45 — next after merge: `#10` role-based rendering, the last P2 issue). P0 and P1 are complete: walking skeleton + Compose + CI (`#1`–`#5`), Drizzle 10-table schema + migrations (`#6`), session auth — Argon2id, hashed tokens, first-user-manager bootstrap (`#7`), and the `authorize()` choke point with member management + lockout guard (`#14`). Backlog phases: P0 skeleton → P1 data & identity → P2 song library → P3 setlists & live → P4 auth hardening & print → P5 deploy & alpha. All issues live in this repo with `[P#.x]` prefixes — check the board, don't guess scope.

## Hard do-nots (past decisions — do not relitigate)

- No Prisma. No MongoDB. No Redis/RabbitMQ in MVP.
- No CCLI fields or licensing features.
- No capability ACL, annotations, OpenLP export, AI import, or stress-test work before their phase — they're deliberate thesis chapters.
- No native mobile apps; PWA only, and post-alpha.
- No global tag pool: tags are group-scoped vocabularies; cross-group sharing resolves by normalized name later.
- No per-setlist guest scoping before post-alpha (readers see the whole group library).
- No multi-group in the MVP: group creation, invitations, and join mechanics land post-alpha (invite link, code, or email — mechanics TBD). The schema is multi-tenant already; the app layer enforces the single group (registration bootstraps it, first user becomes group_manager).
- No OT/CRDT collaborative editing: notify-only events + refetch.
- Don't redesign the 10-table schema without discussing it here first.
