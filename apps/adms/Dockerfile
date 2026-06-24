# ----------------------------------------------------------------------
# ZK Connect — ADMS endpoint service (Hono, multi-tenant)
# Built from the monorepo root context. Run as:
#   docker build -f apps/adms/Dockerfile -t zkc-adms .
# ----------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Builder: install full workspace deps + compile -----------------
FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/ ./packages/
COPY apps/adms/ ./apps/adms/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @zkc/adms build

# ---- Runtime: minimal image, only the adms app + prod deps ----------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/adms/dist ./dist
COPY --from=builder /repo/apps/adms/package.json ./package.json
COPY --from=builder /repo/apps/adms/drizzle ./drizzle
COPY --from=builder /repo/packages/db ./node_modules/@zkc/db
COPY --from=builder /repo/packages/shared ./node_modules/@zkc/shared
COPY --from=builder /repo/node_modules ./node_modules

RUN mkdir -p logs

EXPOSE 8080
CMD ["node", "dist/index.js"]
