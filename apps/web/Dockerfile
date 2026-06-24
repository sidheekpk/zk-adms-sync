# ----------------------------------------------------------------------
# ZK Connect — Next.js admin web app
# Built from the monorepo root context. Run as:
#   docker build -f apps/web/Dockerfile -t zkc-web .
# ----------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Deps: install ALL workspace deps ------------------------------
FROM base AS deps
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile

# ---- Builder: compile Next.js with standalone output ----------------
FROM deps AS builder
WORKDIR /repo/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# next.config must have output: 'standalone' for the slim runtime to work
RUN pnpm run build

# ---- Runtime: standalone Next.js server ----------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
