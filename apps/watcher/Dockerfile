# syntax=docker/dockerfile:1
#
# Watcher generation service. Build from the repository root:
#
#   docker build -f apps/watcher/Dockerfile -t talespin-watcher .
#   docker run -p 4000:4000 --env-file apps/watcher/.env talespin-watcher
#
# The watcher has no request authentication; expose it only on a private
# network reachable by worldbuilder and its workers.

ARG NODE_IMAGE=node:20.19.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
# Activate the pinned pnpm at build time so the non-root runtime user never
# needs network access to resolve it.
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate \
  && chmod -R a+rX /opt/corepack
WORKDIR /repo

# Download every locked package once; later installs run offline.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile --ignore-scripts
RUN pnpm build:schema \
  && pnpm build:ai \
  && pnpm build:cdn \
  && pnpm build:watcher

FROM deps AS prod-deps
COPY . .
# `pnpm fetch` fills node_modules/.pnpm with the whole lockfile; start clean so
# the filtered production install keeps only this app's dependency closure.
RUN rm -rf node_modules \
  && pnpm install --offline --frozen-lockfile --ignore-scripts --prod \
    --filter @talespin/watcher...

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
COPY --from=prod-deps /repo /repo
COPY --from=build /repo/packages/schema/dist /repo/packages/schema/dist
COPY --from=build /repo/packages/ai/dist /repo/packages/ai/dist
COPY --from=build /repo/packages/cdn/dist /repo/packages/cdn/dist
COPY --from=build /repo/apps/watcher/dist /repo/apps/watcher/dist
WORKDIR /repo/apps/watcher
USER node
EXPOSE 4000
CMD ["pnpm", "--silent", "start:prod"]
