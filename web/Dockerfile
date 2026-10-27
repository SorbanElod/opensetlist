# Dev image for the web app. Build context must be the repo root because
# pnpm workspaces need the root manifests to install.
FROM node:20-alpine

WORKDIR /work
RUN corepack enable

# Manifests first: this layer stays cached while source code changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY web ./web

EXPOSE 5173
# --host 0.0.0.0: Vite binds all interfaces, otherwise it is unreachable
# from outside the container. Compose bind-mounts ./web over /work/web.
CMD ["pnpm", "-C", "web", "dev", "--host", "0.0.0.0"]
