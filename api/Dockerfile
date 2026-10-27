# Dev image for the api. Build context must be the repo root because
# pnpm workspaces need the root manifests to install.
FROM node:20-alpine

WORKDIR /work
RUN corepack enable

# Manifests first: this layer stays cached while source code changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY api ./api

EXPOSE 3000
# tsx watch reloads on file change (compose bind-mounts ./api over /work/api).
CMD ["pnpm", "-C", "api", "dev"]
