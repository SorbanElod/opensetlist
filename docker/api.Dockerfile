# Production image for the api. Build context MUST be the repo root:
# pnpm workspaces need the root manifests to install dependencies.
#
# Two stages: `build` compiles TS -> api/dist, `runtime` ships only prod
# dependencies + the compiled output + the drizzle migration files, because
# the deploy pipeline runs `drizzle-kit migrate` inside this image
# (drizzle-kit is a runtime dependency for that reason — see api/package.json).
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

# Manifests first: this layer stays cached while source code changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY api ./api
RUN pnpm -C api build

FROM node:24-alpine
ENV NODE_ENV=production
RUN corepack enable

# Same workspace-root layout as the build stage: pnpm installs from the
# root manifests, and the api's bins (incl. drizzle-kit) land in
# /app/api/node_modules/.bin, where `npx drizzle-kit migrate` finds them.
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
# --prod: no devDependencies (tsx, typescript, vitest) in the image.
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/api/dist ./api/dist
# drizzle-kit migrate loads drizzle.config.ts, which imports ./src/config.js
# (resolved to src/config.ts) and reads migrations from ./src/db/migrations.
COPY api/drizzle.config.ts ./api/drizzle.config.ts
COPY api/src/config.ts ./api/src/config.ts
COPY api/src/db/migrations ./api/src/db/migrations

WORKDIR /app/api
EXPOSE 3000
# Env comes from process.env (compose env_file): DATABASE_URL, NODE_ENV,
# PORT (default 3000), HOST (prod compose sets 0.0.0.0 — inside a container
# loopback would be unreachable from traefik).
CMD ["node", "dist/index.js"]
