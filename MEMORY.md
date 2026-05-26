# MEMORY

## 2026-05-26
- PR `langfuse/langfuse#13832` reviewer follow-up identified a remaining
  unstable pagination path outside the already-fixed MCP/public API service:
  `web/src/server/api/routers/scoreConfigs.ts` tRPC `scoreConfigs.all`.
- Applied the same deterministic ordering fix to the tRPC path:
  `orderBy: [{ createdAt: "desc" }, { id: "asc" }]`.
- Added tRPC regression coverage in
  `web/src/__tests__/server/scores-trpc.servertest.ts` for tied
  `createdAt` timestamps across paginated `scoreConfigs.all` results.
- Local environment repair work on Windows checkout:
  - `pnpm install` initially failed because root `scripts/postinstall.sh`
    executed under `bash` with CRLF line endings.
  - Bootstrapped deps with `pnpm install --ignore-scripts`.
  - Vitest then failed because `@langfuse/shared` could not resolve:
    `packages/shared/dist/**` was missing and `@prisma/client` was exposing a
    broken `.prisma` link layer.
  - Recovered Prisma/shared build chain by running:
    - `pnpm exec prisma generate --schema packages/shared/prisma/schema.prisma`
    - `pnpm --filter @langfuse/shared run build`
- Added minimal local `.env` and `.env.test` files from repo examples to satisfy
  required server-test env validation (`CLICKHOUSE_*`,
  `LANGFUSE_S3_EVENT_UPLOAD_BUCKET`, auth basics, postgres/redis URLs).
- Targeted Vitest commands now reach real infrastructure bootstrap instead of
  failing on imports/env:
  - `pnpm --filter web exec vitest run --project server src/__tests__/server/scores-trpc.servertest.ts -t "should paginate score configs deterministically when createdAt timestamps tie"`
  - `pnpm --filter web exec vitest run --project server src/__tests__/server/score-configs.servertest.ts -t "should paginate score configs deterministically when createdAt timestamps tie"`
  - `pnpm --filter web exec vitest run --project server src/__tests__/server/mcp-tools-read.servertest.ts -t "should paginate score configs deterministically when createdAt timestamps tie"`
- Remaining local verification blocker is infrastructure, not code:
  PostgreSQL is not reachable at `localhost:5432`, so test setup aborts while
  trying to create/migrate `langfuse_test`.
