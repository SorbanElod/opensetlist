# 🎼 OpenSetlist

> Multi-tenant SaaS for worship planning & gig management — setlists, ABC Notation sheet-music rendering, and role-based views. Built as a master's thesis project (Enterprise Software Design & Development, BBTE Cluj).

**Status:** 🚧 MVP in development — thin vertical slice, alpha planned for early 2027.

## What it does

- **Songs & arrangements** — songs (abstract metadata) are decoupled from arrangements (variants: key, BPM, section structure)
- **ABC Notation as the single source of truth** — music is stored as ABC text; the frontend renders chords (guitarist view), lyrics (singer view), or a grand staff from the same source
- **Setlists** — ordered arrangement items with per-item key & sequence overrides
- **Live updates** — edits appear instantly on every group member's device (Socket.IO notify + refetch)
- **Planned after the alpha** — capability-based access control, annotations anchored to musical structure, OpenLP export microservice, 1M+ document stress-tested schema

## Stack

| Layer    | Choice                                     |
| -------- | ------------------------------------------ |
| Database | PostgreSQL (JSONB) + Drizzle migrations    |
| Backend  | Fastify + TypeScript + Zod                 |
| Frontend | React + Vite + TypeScript, abcjs rendering |
| Realtime | Socket.IO (per-group rooms, notify-only)   |
| Infra    | Docker Compose + Traefik, homelab-hosted   |

## Development

Solo project with an AI-assisted workflow ([Vibe Code](https://docs.mistral.ai/vibe/code/overview)): agent-authored commits are marked, and every change lands through a reviewed pull request. Development is issue-first — one branch per issue, `main` stays green.

See [AGENTS.md](./AGENTS.md) for the working conventions.

## Local development (Docker Compose)

Fresh clone to a running stack (Postgres + API + web):

```bash
docker compose up --build
```

- Web: http://localhost:5173 (Vite dev server with hot reload)
- API: http://localhost:3000/healthz (tsx watch reload)

`psql` access from the host:

```bash
docker compose exec db psql -U opensetlist -d opensetlist
```

Postgres data lives in the `postgres_data` volume and survives container
restarts and rebuilds. To wipe it: `docker compose down -v`.

Ports and credentials all have defaults; copy `.env.example` to `.env` to
override them (never commit `.env`).

## License

[MIT](./LICENSE) — © 2026 Előd Sorbán
