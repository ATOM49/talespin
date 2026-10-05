# syntax=docker/dockerfile:1
#
# Worldbuilder web app and its background workers share this image.
# Build from the repository root:
#
#   docker build -f apps/worldbuilder/Dockerfile \
#     --build-arg MINIO_PUBLIC_HOST=https://cdn.example.com \
#     -t talespin-worldbuilder .
#
# Web (default):        docker run talespin-worldbuilder
# World worker:         docker run talespin-worldbuilder worker:world-generation
# Narrative worker:     docker run talespin-worldbuilder worker:narrative-generation
#
# Runtime configuration (DATABASE_URL, NEXTAUTH_SECRET, OAuth credentials,
# WATCHER_API_URL, ...) is passed as environment variables at `docker run`.

ARG NODE_IMAGE=node:20.19.0-bookworm-slim
# next/image reads the CDN host from next.config.ts at build and start; the
# build args become runtime defaults that `docker run -e` can still override.
ARG MINIO_PUBLIC_HOST=http://localhost:9000
ARG MINIO_BUCKET=images

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
# Prisma's query engine links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
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
ARG MINIO_PUBLIC_HOST
ARG MINIO_BUCKET
# NEXT_PUBLIC_* values are inlined into client bundles at build time.
ARG NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY=
COPY . .
RUN pnpm install --offline --frozen-lockfile --ignore-scripts
RUN pnpm build:schema \
  && pnpm build:game-engine \
  && pnpm --filter @talespin/worldbuilder exec prisma generate \
  && pnpm build:world

FROM deps AS prod-deps
COPY . .
# `pnpm fetch` fills node_modules/.pnpm with the whole lockfile; start clean so
# the filtered production install keeps only this app's dependency closure.
RUN rm -rf node_modules \
  && pnpm install --offline --frozen-lockfile --ignore-scripts --prod \
    --filter @talespin/worldbuilder... \
  && pnpm --filter @talespin/worldbuilder exec prisma generate

FROM base AS runtime
ARG MINIO_PUBLIC_HOST
ARG MINIO_BUCKET
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MINIO_PUBLIC_HOST=${MINIO_PUBLIC_HOST} \
    MINIO_BUCKET=${MINIO_BUCKET}
COPY --from=prod-deps /repo /repo
COPY --from=build /repo/packages/schema/dist /repo/packages/schema/dist
COPY --from=build /repo/packages/game-engine/dist /repo/packages/game-engine/dist
COPY --from=build --chown=node:node /repo/apps/worldbuilder/.next /repo/apps/worldbuilder/.next
WORKDIR /repo/apps/worldbuilder
USER node
EXPOSE 3000
ENTRYPOINT ["pnpm", "--silent"]
CMD ["start"]
