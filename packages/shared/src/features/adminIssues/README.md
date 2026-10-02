# Admin issues

Admin issues are project-scoped entries in `issue_logs`. Scheduled rules and request handlers use the definitions in `adminIssueDefinitions.ts`; request handlers call `createAdminIssue` directly.

## Local demo

Start the local web and worker with Redis, Postgres, ClickHouse, and the example project seeded (`pnpm run dx` on a fresh setup). Set these values in `.env` before starting them:

```dotenv
NEXT_PUBLIC_LANGFUSE_CLOUD_REGION="DEV"
LANGFUSE_RATE_LIMITS_ENABLED="true"
LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only
```

Then run:

```bash
pnpm run seed -- apply admin-issues-demo
pnpm --filter @langfuse/shared run demo:admin-issues
```

In the CLI, choose **1** for an oversized ingestion request and **2** for a rate-limit issue. Open [Issue Detection](http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/settings/issue-detection) and click **Run detection** to turn the seeded data into scheduled-rule issues. The worker processes that job; refresh the page to see the results. The two CLI issues appear without running detection, and so does **Long metadata values**: the worker raises it within about 10 seconds of ingesting the seeded span.
