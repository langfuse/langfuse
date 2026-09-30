# Admin issues

Admin issues are project-scoped entries in `issue_logs`. Scheduled rules and request handlers use the definitions in `adminIssueDefinitions.ts`; request handlers call `createAdminIssue` directly. The demo CLI triggers the server-side oversized-body and rate-limit issues with the seeded project API key.

## Local demo

1. Start the local stack and seed the example data with `pnpm run dx`, or use an existing local stack with `pnpm --filter=shared run db:seed:examples`.
2. Check that the web server's `.env` has `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION="DEV"` (as in `.env.dev.example`) and `LANGFUSE_RATE_LIMITS_ENABLED="true"`. Restart the web server after changing the environment. This only enables the existing rate-limit path locally; no Cloud deployment is needed. Redis must be running.
3. Run `pnpm --filter @langfuse/shared run demo:admin-issues` and choose an issue.
4. Open the seeded project at `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/settings/issue-detection` to inspect the new log entry.

The rate-limit action sends small requests to `GET /api/public/v2/metrics` until the `public-api-v2-metrics` budget returns 429. The seeded Team plan allows 100 requests per hour for that budget. The CLI makes at most 150 requests, in batches of 10, and stops at the first batch containing a 429. The intentionally invalid query fails validation before executing a metrics query. If the Redis bucket already contains requests, the CLI may reach 429 sooner. The issue description records the route name, resource, allowance, and retry time. A Redis key lasting only until the rate-limit window resets permits one issue per project and resource in that window.
