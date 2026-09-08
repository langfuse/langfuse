# Signal Boundaries — Which System Holds Which Half of the Truth

Read this before concluding that a signal is absent. Our telemetry is split by
**where the code ran**, not by severity, and each store drops data on purpose.
An empty result is only evidence when the store you queried is the one that
would have recorded the event.

## The split

| Where the code ran | Recorded in | Not recorded in |
| --- | --- | --- |
| `web` server (API routes, tRPC, SSR), `web-ingestion`, `web-iso` | Datadog APM spans + logs | Sentry |
| `worker`, `worker-cpu` (BullMQ consumers) | Datadog APM spans + logs | Sentry |
| The user's **browser** | Sentry (`@sentry/nextjs`), Datadog RUM | Datadog APM/logs |
| A deliberate product action | PostHog | Datadog, Sentry |

**Sentry is browser-only.** The one `Sentry.init` lives in
[`web/instrumentation-client.ts`](../../../../web/instrumentation-client.ts),
and `@sentry/nextjs` is a dependency of `web` alone — not `worker`, not
`packages/shared`. So:

- An ingestion, queue, or worker failure **cannot** appear in Sentry. Zero
  Sentry issues for a worker symptom is the expected shape, never a sign the
  handler is healthy.
- Conversely, a "page is broken for one customer" report with nothing in
  Datadog APM may be entirely client-side. Check Sentry and RUM before
  concluding nothing happened.

## Absence is manufactured, not neutral

Each store discards data by design. Before writing "No measurements found",
name which of these could explain it:

- **Sentry `beforeSend` drops whole classes of event.** React DevTools probes,
  poll 5xx from `httpClientIntegration` (the NextAuth session poll dominates
  it), known-benign transport/offline/CORS failures, and PostHog recorder
  internals are filtered; stale-chunk parse errors are collapsed onto a single
  fingerprint. See `web/src/utils/sentryFilters.ts` and the
  [`sentry-instrumentation`](../../sentry-instrumentation/SKILL.md) skill.
- **APM traces are sampled.** `web` applies a `TraceIdRatioBasedSampler`
  driven by `OTEL_TRACE_SAMPLING_RATIO`, and the `next.js` tracer scope is
  muted deliberately. A missing span is not a missing request.
- **Health-check routes are never instrumented.** `ignoreIncomingRequestHook`
  drops `/api/public/health`, `/api/public/ready`, and `/api/health`.
- **PostHog captures shape, never raw values**, so it cannot answer "what did
  this user type" — only that a step happened.

## Release correlation — the deploy question

"Did this start with a deploy?" is answered by the **build id**, which is the
one identifier both stores share:

| Store | Field | Source |
| --- | --- | --- |
| Datadog | `service.version` (the `version` tag) | `BUILD_ID`, set as the OTel resource `service.version` in [`web/src/observability.config.ts`](../../../../web/src/observability.config.ts) and [`worker/src/instrumentation.ts`](../../../../worker/src/instrumentation.ts) |
| Sentry | `release` | `NEXT_PUBLIC_BUILD_ID` |

Because both derive from the same build, a `version` in Datadog and a `release`
in Sentry name the same deploy — group errors by it to separate "new in this
build" from "pre-existing". Deploys themselves are driven by
`.github/workflows/deploy.yml`, whose environment inputs are the same
`prod-us` / `prod-eu` / `prod-hipaa` / `prod-jp` (plus `staging`) values as the
`env` tag.

## Tenant correlation

`addUserToSpan` in
[`packages/shared/src/server/instrumentation/index.ts`](../../../../packages/shared/src/server/instrumentation/index.ts)
sets these as **both** span attributes and OTel **baggage**, so they propagate
to child spans rather than sitting only on the span that authenticated:

- `langfuse.project.id`
- `langfuse.org.id`
- `user.id`

Error attributes from the same file — `error.type`, `error.message`,
`error.stack` — are what Datadog Error Tracking groups on. Note the log-side
facet is `@projectId` **or** `@langfuse.project.id` depending on the
instrumentation site; see `datadog-playbook.md` before assuming one.

Treat `user.id` as customer-identifying: correlate with it, but do not paste it
into an analysis, a ticket, or a PR description.

## `prod-hipaa`

Regulated data. Do not quote or copy payloads out of it, and do not assume its
access, retention, or instrumentation matches `prod-us` — confirm before
promising a measurement.
