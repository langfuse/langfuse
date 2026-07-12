# observations-api (Go)

A Go sidecar service that serves `GET /api/public/v2/observations` with the
exact wire contract of the Node.js implementation
(`web/src/pages/api/public/v2/observations/index.ts`), optimized for
high-throughput ClickHouse reads (native protocol, no per-request schema
revalidation).

## Architecture

The service replicates the Node route layer-for-layer:

| Layer          | Go package           | Node source of truth                                           |
| -------------- | -------------------- | -------------------------------------------------------------- |
| Error contract | `internal/apierror`  | `web/.../withMiddlewares.ts`, `createAuthedProjectAPIRoute.ts`  |
| Auth           | `internal/auth`      | `web/.../apiAuth.ts`, `packages/shared/.../auth/apiKeys.ts`     |
| Rate limiting  | `internal/ratelimit` | `web/.../RateLimitService.ts`                                   |
| Query params   | `internal/query`     | `GetObservationsV2Query` zod schema (`types/observations.ts`)   |
| SQL builder    | `internal/chquery`   | `packages/shared/.../events.ts`, `event-query-builder.ts`       |
| Row → wire     | `internal/wire`      | `observations_converters.ts` + route transforms                 |
| Enrichment     | `internal/enrich`    | `enrichObservationsWithModelData` (Postgres models/prices)      |

### Auth: hot path in Go, cold path delegated

- **Fast path** (>99% of requests): salted SHA-256 fast hash of the secret
  key → Redis `GETEX api-key:<hash>` (the exact cache the Node
  `ApiAuthService` maintains, sliding TTL). No Postgres involved.
- **Miss path**: POST to the Node web service's internal endpoint
  `/api/internal/verify-api-key` (guarded by `LANGFUSE_INTERNAL_API_SECRET`).
  Node runs the full flow — bcrypt legacy keys, fast-hash upgrade writes,
  plan resolution — and warms the shared Redis cache as a side effect.
  This service intentionally implements **no bcrypt and no Postgres auth**.

### Rate limiting: shared fixed-window counters

Increments the same Redis keys as the Node stack's `rate-limiter-flexible`
(`rate-limit:public-api:<orgId>`, integer counter + window TTL), so an org's
budget is shared when both stacks serve traffic. Fail-open on Redis errors;
disabled entirely when `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` is unset
(self-hosted), matching Node.

### Traffic routing

`web/next.config.mjs` proxies `/api/public/v2/observations` to this service
via a `beforeFiles` rewrite when `LANGFUSE_GO_OBSERVATIONS_API_URL` is set.
Unset the variable to fall back to the Node implementation instantly.
Cloud deployments can instead route the path at the load balancer.

## Configuration

Uses the same env var names as the Node services:

| Variable                                       | Required | Notes                                             |
| ---------------------------------------------- | -------- | ------------------------------------------------- |
| `SALT`                                         | yes      | must match langfuse-web (fast-hash formula)       |
| `DATABASE_URL`                                 | yes      | model/price enrichment                            |
| `CLICKHOUSE_NATIVE_URL` or `CLICKHOUSE_URL`    | yes      | `clickhouse://` = native protocol (preferred)     |
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD`      | yes      |                                                   |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_AUTH`     | yes      | api-key cache + rate-limit counters               |
| `REDIS_KEY_PREFIX`                             | no       | must match langfuse-web when set                  |
| `LANGFUSE_WEB_INTERNAL_URL`                    | yes      | Node web base URL for auth-miss delegation        |
| `LANGFUSE_INTERNAL_API_SECRET`                 | yes      | must match langfuse-web                           |
| `LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN`   | yes      | route 404s unless `true` (parity with Node)       |
| `LANGFUSE_CACHE_API_KEY_ENABLED` / `..._TTL_SECONDS` | no | default `true` / `300`                        |
| `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION`            | no       | presence enables rate limiting                    |
| `LANGFUSE_RATE_LIMITS_ENABLED`                 | no       | default `true`                                    |
| `PORT`                                         | no       | default `3210`                                    |

## Development

```bash
cd go/observations-api
go build ./...
go test ./...          # unit tests (no infra needed)

# Redis-backed rate-limit interop tests (needs local dev Redis):
OBSERVATIONS_API_REDIS_ADDR=127.0.0.1:6379 OBSERVATIONS_API_REDIS_AUTH=myredissecret \
  go test ./internal/ratelimit/
```

Run locally against the dev docker-compose infra (from the repo root, with
the web dev server running for auth delegation):

```bash
env $(grep -v '^#' .env | grep -E '^(SALT|DATABASE_URL|CLICKHOUSE|REDIS|LANGFUSE_)' | tr -d '"' | xargs) \
  LANGFUSE_WEB_INTERNAL_URL=http://localhost:3000 \
  CLICKHOUSE_NATIVE_URL=clickhouse://localhost:9000 \
  go run ./cmd/server
```

## Testing strategy

1. **Go unit tests** pin the pure logic: fast-hash vectors (generated from the
   Node implementation), cursor codec, zod-parity param validation, golden
   SQL fragments per filter operator, Prisma-Decimal string formatting,
   row-to-wire conversion quirks (0ms latency → null, promptVersion 0 → null,
   empty IO → null, `parent_observation_id: "" → null`).
2. **Contract suite**: the existing behavioral test file
   `web/src/__tests__/server/observations-api-v2.servertest.ts` (37 tests)
   runs unchanged against this service in CI — the web server proxies the
   route to the Go sidecar via `LANGFUSE_GO_OBSERVATIONS_API_URL`, so the
   Node-era contract is enforced end to end (`tests-go-observations-api` job).
3. **Rate-limit interop test** verifies shared Redis counters with
   `rate-limiter-flexible`'s layout.

## Known intentional parity quirks

Replicated from the Node implementation on purpose — do not "fix" here
without changing Node first:

- The list query has no `FINAL`, no `is_deleted = 0`, no `LIMIT 1 BY`; reads
  rely on ReplacingMergeTree background merges (io CTE deduped via
  `LEFT ANY JOIN`).
- The request that consumes the last rate-limit point already receives 429
  (`remainingPoints < 1` semantics of the Node stack).
- `limit=0` is valid and returns an empty page; `limit` is not forced to an
  integer.
- Advanced filters and simple query params on the same field are ANDed (the
  Node "precedence" dedupe compares field expressions that never match for
  events tables).
- Metadata values are truncated to 200 chars unless `expandMetadata` (or the
  `io` field group) routes the query through `events_full`.
