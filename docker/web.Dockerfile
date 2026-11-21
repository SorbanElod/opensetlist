# Production image for the web app: Vite production build -> static files
# served by nginx. Build context MUST be the repo root: pnpm workspaces
# need the root manifests to install dependencies.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

# Manifests first: this layer stays cached while source code changes.
# (Both workspace members' package.json files are needed for
# --frozen-lockfile; the api's source is not part of the web build.)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY web ./web
# 'tsc --noEmit && vite build' -> web/dist (index.html + assets).
RUN pnpm -C web build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
