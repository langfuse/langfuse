# Toast audit

Research note on what the production `toast:shown` events are, where the copy and tRPC codes come from, and how to reproduce each high-volume case. This note describes the current code. It does not propose changes.

Findings come from a recent multi-day Langfuse Cloud extract of `toast:shown` on an internal analytics dashboard. Every recorded host was Langfuse Cloud. Procedures below are ranked by how often they appeared. Shares are qualitative (most of a slice, a small set of users, mostly repeats) rather than exact counts.

The event property is `operation`. There is no `intent` property. Early dashboard screenshots that said "intent" or "(missing intent)" were a renamed view of `operation`.

## Shape of the extract

WARNING is the largest non-success slice, then ERROR. Most WARNING events carry an `operation`. Most ERROR events in this window do not. `isOperationFallback` was never true. `hasErrorId` was common on WARNING and uncommon on ERROR.

Success instrumentation started during 2026-10-07. Weekday volume is much higher than the weekend; that is traffic, not a code change.

## 1. Infrastructure

One toast library: Sonner `^2.0.7`. The only production imports of `toast` from `sonner` are the wrappers in `web/src/features/notifications/`. ESLint `no-restricted-imports` in `web/eslint.config.mjs` rejects a direct Sonner import elsewhere.

| Wrapper | What it renders | Analytics |
| --- | --- | --- |
| `showErrorToast` | Custom card via `toast.custom`. Default type `ERROR` (red). Pass `"WARNING"` for the yellow card. Duration `Infinity` (sticky). ERROR cards include "Report issue to Langfuse team". | `toast:shown` from `ErrorNotification`, properties from `getToastErrorProperties`. |
| `showSuccessToast` | Custom card. Default duration 5s. `export.queue` passes 10s and a link. | `toast:shown` with `toastType: SUCCESS`, `source: application`. |
| `showToast` | Native Sonner (`toast.error` / `warning` / `success` / `info` / `loading` / `message`), capture on mount. | Same allowlist. |
| `trpcErrorToast` | Calls `showErrorToast`. This is the global tRPC path. | `source: "trpc"`. |

Public exports are `web/src/features/notifications/index.ts`. `showCustomToast` is only referenced from tests.

The toaster is mounted once, in `web/src/components/layouts/app-layout/variants/AuthenticatedLayout.tsx`, as `<Toaster visibleToasts={1} />`. Styled in `web/src/components/ui/sonner.tsx` (top-right, `ph-no-capture`). Signed-out pages do not mount it, so a query error there is not a toast. With `visibleToasts={1}`, a second sticky toast waits until the first is dismissed. PostHog counts a toast when its card mounts, so two procedures can be two events and one visible card.

### What is sent to PostHog

`usePostHogClientCapture` registers `toast:shown`, `toast:report_issue`, and `toast:dismiss`. `getToastErrorProperties` in `web/src/features/notifications/toastAnalytics.ts` allowlists:

`toastType`, `source`, `operation`, `errorOrigin`, `errorCategory`, `path` (the tRPC procedure, from `analytics.trpcPath`), `trpcCode`, `httpStatus`, `hasErrorId`, `isOperationFallback`, `errorId`.

Title, description, and exception text are not captured. `isOperationFallback` is true only when `operation` is the literal `query.execute` or `mutation.execute`.

`ToastOperation` is either a string from the allowlist in `toastOperations.ts` (application toasts) or a typed tRPC procedure path. Origins are `frontend` | `backend` | `network`. Categories are `user_input` | `permission` | `product_state` | `rate_limit` | `resource_limit` | `transient` | `internal`. The strings `unknown` / `unknown` in the extract are not in the current types. They were written when analytics arguments were still optional (see section 4).

The card's displayed "Path:" is the `path` prop passed into `showErrorToast`. The analytics `path` is `analytics.trpcPath`. Those can differ.

## 2. How a backend error becomes a toast

There is one global seam: `queryClientConfig` in `web/src/utils/api.ts`.

**Queries.** `QueryCache.onError` always calls `handleTrpcError`. A per-query `onError` does not replace it. The only opt-outs are `meta.silentHttpCodes` (silence when the HTTP status is in the list), `meta.silentAllErrors: true`, or a network-connectivity error (`failed to fetch` with no response). Most read hooks set none of these, so a 404 or 403 on a background query toasts.

**Mutations.** `defaultOptions.mutations.onError` calls the same helper. A mutation-level `onError` **replaces** that default (`reportTrpcErrorWithoutToast` documents this). `mutateAsync().catch` does not replace it, so the global toast still fires and the catch can fire a second one.

`MutationCache` (`createToastOperationMutationCache` in `trpcToastOperation.ts`) only records `meta.toastOperation` onto a WeakMap. It does not toast. `buildIdLink` calls `rememberTrpcToastOperation(err, op.path)` before React Query sees the error, so the procedure path stays attached to the error object even when `error.data.path` is missing.

`resolveToastOperation` picks, in order: the linked tRPC path, the WeakMap application operation, `meta.toastOperation` if it is on the allowlist, then the fallback `query.execute` / `mutation.execute`. Query keys are not used, because they can contain tenant ids.

`shouldShowToast` debounces for 20 seconds (`ERROR_DEBOUNCE_MS`), keyed by `path::httpStatus` for a `TRPCClientError`, otherwise `error::message`. Two procedures on the same page are two toasts. The same procedure refetches into one toast per 20 seconds.

Query retry (`api.ts`): the client default does **not** retry HTTP 404; every other status retries while `failureCount < 3`. A query can override that. `events.byTraceId` only skips `UNAUTHORIZED`, so a 404 on that query is retried. Debounce still collapses the burst into one toast. `refetchOnWindowFocus` defaults to true, so a failed query toasts again after the 20 second window when the tab regains focus. `staleTime: Infinity` does not apply to failed queries.

### WARNING vs ERROR

`trpcErrorToast` (`web/src/utils/trpcErrorToast.tsx`) sets type `ERROR` only when `httpStatus` is 500–599. Every 4xx is `WARNING`. If `error.data.httpStatus` is missing, `getErrorTitleAndHttpCode` **defaults the status to 500**, so a `TRPCClientError` with no parsed envelope is an ERROR titled "Unexpected Error" even when the transport was not a 5xx.

Title comes from `errorTitleMap`, keyed by the tRPC code, not from the human message:

| Code | Title the user sees |
| --- | --- |
| `BAD_REQUEST` | Bad Request |
| `UNAUTHORIZED` | Unauthorized |
| `FORBIDDEN` | Forbidden |
| `NOT_FOUND` | Not Found |
| `PRECONDITION_FAILED` | Precondition Failed |
| `UNPROCESSABLE_CONTENT` | Unprocessable Content |
| `CONFLICT` | Conflict |
| `INTERNAL_SERVER_ERROR` | Internal Server Error |

HTTP 422 whose `errorName` is `ClickHouseResourceError` uses the title "Request Timed Out" instead. A response whose body is not JSON (`error.cause` is `SyntaxError`) is a WARNING titled "Unexpected Response", description "The request could not be completed...".

Description order: formatted Zod issues, else `error.message`, else `getErrorDescription`. The last function returns "Internal error" for anything that is not 429, 524, or 5xx. A 4xx thrown with an empty message therefore reads "Internal error" under a 4xx title. 5xx descriptions are the scrubbed "Internal server error. We've received an alert...".

When the Zod detector matches, the title is replaced with "Invalid input" and the description is the field list (`formatTrpcZodValidationDescription`).

### Why Sentry is quiet and the toast is not

`isExpectedTrpcClientError` in `api.ts` does not send `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`, `UNPROCESSABLE_CONTENT`, a couple of expected `CONFLICT` / `BAD_REQUEST` paths, or Zod validation to Sentry. The comment there says the UI already renders these as an error page or a toast. The toast path does not share that exemption. `handleTrpcError` still calls `trpcErrorToast` after the Sentry breadcrumb.

`withErrorHandling` in `web/src/server/api/trpc.ts` logs `NOT_FOUND` / `UNAUTHORIZED` as info and other 4xx as warn. On Cloud, 4xx messages are returned to the client; 5xx messages are replaced with a generic internal-error string. `BaseError` subclasses are mapped with `getTRPCErrorCodeFromHTTPStatusCode` (`resolveError`), so a `BaseError` with HTTP 412 becomes tRPC `PRECONDITION_FAILED`, and HTTP 403 `ForbiddenError` becomes `FORBIDDEN`.

## 3. Call sites vs volume

A walk of `web/src` (excluding `*.clienttest.*`, `*.servertest.*`, `*.stories.*`, and the wrapper files themselves) finds:

| Helper | Calls | Files |
| --- | ---: | ---: |
| `showErrorToast` | 149 | 70 |
| `showSuccessToast` | 108 | 83 |
| `trpcErrorToast` | 31 | 17 |
| `showToast` | 28 | 18 |

Those counts are source references, not production volume. The WARNING volume in section 6 is the `QueryCache` / default mutation `onError` seam, not these call sites. Largest clusters of explicit calls: evals 51, dashboard 33, widgets 21, `components` 21, billing 20, datasets 16, skills 15, monitors 13, traces 12, experiments 11.

One React error boundary shows up in trace UI (`TraceMessagesView.tsx`, `@sentry/nextjs`). It does not toast.

## 4. ERROR events with no operation

Most ERROR events in this window had no `operation`. This is an instrumentation gap across 6–12 October 2026, not a pile of unexplained crashes on today's build.

| Commit | When (UTC) | What the event looked like |
| --- | --- | --- |
| `1a21a4229` | 2026-10-06 17:29 | `toast:shown` gained `toastType`, `source`, optional `path` (`error.data.path`), `hasErrorId`. No `operation`, origin, or category (PostHog null). |
| `ff0ef342e` | 2026-10-07 13:57 | Error ids added. |
| `3ff1ad7da` | 2026-10-07 18:55 | Classification and success toasts. If the caller omitted analytics, origin and category were the literal `"unknown"` and `operation` was omitted. |
| `bd19c212a` | 2026-10-08 08:50 | `operation` copied from `error.data.path` when that field existed. A failure with no parsed tRPC envelope still had no operation. |
| `b93c7b7a8` | 2026-10-12 11:20 | `operation`, origin, and category required. Unattributed global failures use `query.execute` / `mutation.execute` and set `isOperationFallback`. |

`isOperationFallback` is never true in the extract, so either that deploy was not serving the recorded hosts yet or every failure after it resolved a path.

ERROR origins in the same window, largest first: `frontend` / `internal`, then the literal `unknown` / `unknown`, then null origin and category, then a smaller `backend` / `internal` slice, then a small `backend` / `product_state` slice. Grouping every missing-operation ERROR into one row hides that split. The unknown and null slices are the pre-attribution and optional-analytics periods. Message text was not stored, so those events cannot be replayed as a specific exception.

Where the page URL was the only location (the dashboard falls back to the URL when `properties.path` is empty), ranked by how often that page appeared:

| Location | `source` | What that source means |
| --- | --- | --- |
| `/project/:id/traces` | `trpc` | Global handler, no `error.data.path`. Often a `TRPCClientError` with no envelope, which is titled "Unexpected Error" because missing HTTP status defaults to 500. |
| `/project/:id/playground` | `application` | `showErrorToast` in the playground catch. `operation: "playground.execute"` was added in `b93c7b7a8` (12 Oct). Before that the same toast had no operation. |
| `/project/:id/evals/:id` | `application` | Evaluator setup `showErrorToast` before `operation` was required. |
| `/project/:id/prompts` | `trpc` | Global handler, no path. |
| `/project/:id` | `trpc` | Same. |
| `/project/:id/datasets/:id/items` | `application` | Explicit toast, no operation yet. |
| `/project/:id/experiments` | `application` | Explicit toast, no operation yet. |

A follow-up on current `main` should not expect new events with a missing `operation`. Reproduce the underlying failure under the operation it has now (`playground.execute`, `evaluator.reactivate`, the tRPC path).

Rows that appear both as a named operation and under "missing operation" for the same procedure (notably `projectApiKeys.create`) are the same failures split by the rollout: before 8 Oct the procedure lived in `path` and `operation` was empty; after that, `operation` is the procedure. Do not treat them as two bugs.

## 5. User gaslighting

The toast title is the tRPC code (`errorTitleMap` in `trpcErrorToast.tsx`). The code is chosen by the server for a condition the user often did not cause: a background query, a stale id, a race with our own delete job, a flag mismatch, or a guardrail on a query we authored. The card then reads as if the user submitted a bad request.

Sentry already treats several of these codes as expected product state. The toast still uses the blaming title.

### Codes and the strings they produce

**`NOT_FOUND` → title "Not Found".**

- `enforceTraceAccess` in `web/src/server/api/trpc.ts` throws `NOT_FOUND` / `"Trace not found"` when `traceId` is set and the ClickHouse lookup returns nothing. That middleware wraps `protectedGetTraceProcedure` and `protectedGetEventsTraceProcedure`. It runs before the handler of `events.byTraceId`, `events.scoresForTrace`, `events.batchIO`, `events.getAgentGraphData`, `traces.byIdWithObservationsAndScores`, `traces.getAgentGraphData`, and `observations.byId`.
- `observations.byId` additionally throws `LangfuseNotFoundError` `"Observation not found within authorized project"` (`web/src/server/api/routers/observations.ts`) when the trace was found and the observation was not.
- `sessions.byIdWithScoresFromEvents` throws `NOT_FOUND` / `"Session not found in project"` when `getSessionMetricsFromEvents` returns no row (`web/src/server/api/routers/sessions.ts`). A Postgres session row is not required for this throw, and a Postgres row does not prevent it.
- `handleGetSessionById` (used by `sessions.byIdWithScores`) throws the same message when there is no Postgres `traceSession` row.
- `dashboard.getDashboard` throws `NOT_FOUND` / `"Dashboard not found"` when the row is missing (`web/src/features/dashboard/server/dashboard-router.ts`).
- `enforceUserIsAuthedAndProjectMember` throws `NOT_FOUND` / `"Project not found"` only when the caller is an instance admin and the project id is missing or soft-deleted. A normal member of a missing project gets `UNAUTHORIZED` / `"User is not a member of this project"` instead.
- `requireV4Writes` throws `NOT_FOUND` / `"Not found"` when `LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"`. That is a deployment mode, not a missing resource.

On the v4 trace page this 404 does not reach the dedicated not-found screen. `useTraceDetailData` sets `isNotFound` for the events path only when there is **no data and no error**. `TracePage` then falls through to `Loading...` whenever `trace.data` is empty. A cold open of a missing trace id therefore sticks on "Loading..." with a "Not Found" toast. The v3 path does set `isNotFound` from the code, so it shows `ErrorPage` ("The trace is either still being processed or has been deleted.") **and** the toast, because the query does not set `silentHttpCodes`.

`placeholderData: keepPreviousData` on `events.byTraceId` and `events.scoresForTrace` keeps the previous trace on screen while the new id 404s. The user is looking at trace A and reading "Not Found".

**`FORBIDDEN` → title "Forbidden".**

- `throwIfNoOrganizationAccess` / `throwIfNoProjectAccess` (`web/src/features/rbac/utils/checkOrganizationAccess.ts`) throw `"Forbidden, user does not have access to this resource or action"`. That string is accurate when the member lacks the scope.
- `organizations.delete` uses `FORBIDDEN` for two states that are not "you lack permission" (`web/src/features/organizations/server/organizationRouter.ts`): `"Please delete or transfer all projects before deleting the organization."` and `"Deletion of your projects is still being processed, please try deleting the organization later"`. The second is our async project delete still running. The delete control is already disabled for members without `organization:delete`, so the people who see this toast are owners.
- `members.updateOrgMembership` uses `FORBIDDEN` / `"Cannot remove the last owner of an organization. Assign new owner or delete organization."` (`web/src/features/rbac/server/membersRouter.ts`). That is a product rule. A missing membership row is `NOT_FOUND` with no message.
- `assertInAppAgentAvailable` (`web/src/features/in-app-agent/server/availability.ts`) throws `ForbiddenError` `"Unauthorized, user does not have access to entitlement: in-app-agent"` or `"In-app agent is not enabled for this organization"`. The instance-off case is HTTP 412, `"In-app agent is not enabled on this instance."`, which becomes `PRECONDITION_FAILED`, not `FORBIDDEN`. `useInAppAgentActivity` polls `listConversations` on an interval with window-focus refetch and no silent codes, so the nav badge toasts "Forbidden" with no send action. Opening the assistant adds a second card: `InAppAiAgentProvider` watches `conversationListQuery.error` and calls `showErrorToast("Failed to load conversations", ..., operation: "in_app_agent_conversations.load")` with the default type `ERROR`. The recorded WARNING events for this procedure are the global toast (`inAppAgent.listConversations`). The red card is a different operation.

**`UNAUTHORIZED` → title "Unauthorized".**

- No session: `enforceUserIsAuthedAndProjectMember` throws `UNAUTHORIZED` with no custom message.
- Signed in, not a member: `"User is not a member of this project"`.
- Trace not public and caller not a member: `"User is not a member of this project and this trace is not public"`.
- Session equivalent: `"User is not a member of this project and this session is not public"`.

`v4Transition.forceV3Experience` does not throw. It is a `protectedProjectProcedure` query. The 401 is the membership middleware. The hook `useForceV3Experience` runs from project navigation whenever a project id is set (`staleTime: Infinity` applies only after a success). Session expiry or a project id the user is not in toasts "Unauthorized" on a page they did not submit.

**`BAD_REQUEST` → title "Bad Request"** (or "Invalid input" when the Zod detector matches).

- Procedure input that fails Zod. `projectApiKeys.create` rejects a non-future `expiresAt` (`"Expiration date must be in the future"`), a `name` that fails `StringNoHTML`, and a non-null `role` unless `API_AUTH_MIGRATION === "enforce"` and `API_KEY_PROJECT_ROLES_ENABLE === "true"` (`"API key role selection is not enabled"`, `apiKeyCreationRoleSchema.ts`). The handler itself does not throw `BAD_REQUEST`. Missing scope is `FORBIDDEN`.
- `enforceTraceAccess` on an input that fails `inputTraceSchema`: `BAD_REQUEST` / ``Invalid input, ${zodMessage}``.
- `enforceUserIsAuthedAndProjectMember` when `projectId` is missing: `BAD_REQUEST` / `"Invalid input, projectId is required"`.

`classifyTrpcToastError` labels a `BAD_REQUEST` as `backend` / `user_input` only when `isTrpcZodValidationError` matches (JSON issue list on `error.message`, or a non-empty flattened `data.zodError`) or the path is in `EXPECTED_TRPC_BAD_REQUEST_PATHS` (`datasets.triggerRemoteExperiment`, `datasets.upsertRemoteExperiment`, `models.upsert`). Every other `BAD_REQUEST` is `frontend` / `internal` — analytics say the client is wrong — while the title the user reads is still "Bad Request". `projectApiKeys.create` is not on that allowlist. The recorded production events are `frontend` / `internal`, so the detector did not match them. The message text is not in PostHog; section 6 lists the three schema rejections to try, and says not to assume which one those events were.

**`UNPROCESSABLE_CONTENT` → title "Unprocessable Content", or "Request Timed Out" when `errorName` is `ClickHouseResourceError`.**

`withErrorHandling` rewrites a `ClickHouseResourceError` cause to `UNPROCESSABLE_CONTENT` and `ClickHouseResourceError.ERROR_ADVICE_MESSAGE`, which is `RESOURCE_LIMIT_ERROR_MESSAGE` in `packages/shared/src/errors/errorMessages.ts`:

> Your query could not be completed. Please narrow your request by adding more specific filters (e.g., a shorter date range).

The user is told to narrow a request. For `scores.filterOptionsFromEvents`, `events.filterOptions`, `sessions.metrics`, `traces.getAgentGraphData`, and preset `dashboard.executeQuery` widgets, the query was issued by the page. The user did not write it.

**`PRECONDITION_FAILED` → title "Precondition Failed".**

`EvaluatorConfigurationError` is HTTP 412 (`web/src/features/evals/v2/server/evaluators/evaluatorErrors.ts`). Thrown from `assertEvaluatorConfigurationValid` and `evaluatorService.reactivate` with messages such as "Code evaluations are not enabled for this deployment.", "This code evaluator language is not supported by the configured dispatcher.", "Only LLM and decision-model evaluators can be reactivated with a model test.", and the model-timeout / provider-failure strings in `evaluatorValidation.ts` ("The evaluator was not saved. Retry or check your LLM connection and model settings."). A timeout or aborted provider call during our preflight is a 412 titled "Precondition Failed". `evalsV2.update` has no local `onError`, so the global seam shows that title as a WARNING. `evaluator.reactivate` has a local `onError` that calls `showErrorToast` **without** a type, so the same 412 is an ERROR titled "Reactivation failed" (the default type is `ERROR`). That matches the extract: update is WARNING, reactivate is ERROR.

**`INTERNAL_SERVER_ERROR` → title "Internal Server Error".** Description on Cloud is the scrubbed string, not the cause. `prompts.metrics` is one of these, and it is a high-repeat ERROR: the prompts table loads metrics in the background when rows exist (`web/src/features/prompts/server/routers/promptRouter.ts` `metrics`, client `prompts-table.tsx`). The user did not submit a form. A 500 here is a server failure. The card still looks like a reportable user-facing error, and the sticky ERROR toast offers "Report issue".

### Background reads that toast with no submit

These fire because the page mounted, not because the user confirmed an action:

| Procedure | What mounts it |
| --- | --- |
| `events.scoresForTrace`, `events.byTraceId` | `useEventsTraceData`, used by trace detail and annotation-queue object data. Both enabled when `traceId` is set. No `silentHttpCodes`. |
| `events.batchIO` | Same hook, only after `byTraceId` has non-placeholder observations. |
| `traces.byIdWithObservationsAndScores` | Same trace detail hook when the v4 read path is off. |
| `traces.hasTracingConfigured` | Traces, observations, events, project home, setup. Polls every 10s while the project has no `hasTraces` flag. |
| `v4Transition.forceV3Experience` | Project navigation, any project page. |
| `cloudBilling.getSubscriptionInfo` | Billing settings and the plan/invoice widgets on that page. Enabled when an org id exists. |
| `inAppAgent.listConversations` | Activity poll in `useInAppAgentActivity` (always, while the project layout is mounted) and the assistant list (`InAppAiAgentProvider`, only while the panel is open). The open panel also emits `in_app_agent_conversations.load`. |
| `prompts.metrics` | Prompts table, when the page has prompt names. |
| `projects.environmentFilterOptions` | Filter bars (scores, observations, users, and the shared cache hook). |
| `scores.filterOptionsFromEvents`, `events.filterOptions`, `sessions.metrics` | Table filter option / metrics queries. |
| `observations.byId` | Peek, log view, eval preview, prefetch. Some call sites silence 404; several do not (section 6). |

## 6. Reproduction

Local app: `http://localhost:3000`. Sign in as the seeded user `demo@langfuse.com` / `password`. Default project id `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`. Prefill with the seed CLI only (`pnpm run seed -- <scenario>`). `pnpm run seed -- doctor` if the stack is down. The v4 read path is the per-user "Fast (Preview)" sidebar toggle, or `LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only` on the server.

Each case below is one video. Record the toast card (title and body) and the page behind it. Dismiss a sticky toast to see whether a second card was queued (`visibleToasts={1}`). Happy-path seeds are negative controls: they should not toast.

Cloud-only cases (billing entitlement, in-app-agent entitlement) will not 403 on a local stack that has the entitlement off in the way the code short-circuits. Those notes say so.

### `events.scoresForTrace` and `events.byTraceId` — WARNING, `NOT_FOUND` 404

The two highest-volume warnings, in that order. Both are "Trace not found" from `enforceTraceAccess`, not from the handlers.

1. Seed a real trace and confirm the happy path is quiet: `pnpm run seed -- support-agent --v4 --id-prefix a1b2c3d4`. Open the printed trace link with Fast (Preview) on. No toast.
2. Cold missing id, v4 on: open `/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/traces/does-not-exist`. Both queries fire on mount. Expect two WARNING cards, title "Not Found", body "Trace not found", one visible until dismissed. The page stays on "Loading..." (`TracePage` does not treat an events-path error as not-found).
3. Stale id: open the seeded trace, copy the URL, delete the trace from the traces table (bulk delete), reload the detail URL.
4. Placeholder: open the seeded trace, then edit the URL to a missing id without a full reload if client navigation is available, or open trace A and then a missing id from an in-app link. Previous trace stays on screen (`keepPreviousData`) while the toast says not found.
5. Negative control, v3: turn Fast (Preview) off and open the same missing URL. Expect the in-page "Trace not found" error **and** one WARNING toast from `traces.byIdWithObservationsAndScores` (next case). `events.*` should not fire.
6. Annotation queue: `pnpm run seed -- annotation-queue --core-items 12`, open an item whose trace was deleted. Same hook.

`events.byTraceId` retries `NOT_FOUND` (its `retry` only bails on `UNAUTHORIZED`). Debounce should still show one toast per procedure per 20 seconds. Refocus the tab after 20 seconds to see a repeat.

### `events.batchIO` — WARNING, `NOT_FOUND` 404

Do not expect this on a cold missing-id load. The query is enabled only after `byTraceId` returns real observations (`useEventsTraceData`). Same middleware, so a 404 means the trace lookup failed on that later request (trace deleted between the two calls, or the lookup key no longer matches). Video: seed `support-agent`, open the trace, delete it in another tab, return and refocus. If batchIO does not 404, say so; do not force it.

### `traces.byIdWithObservationsAndScores` — WARNING, `NOT_FOUND` 404

v3 trace detail. Same `"Trace not found"` throw, after the handler checks `ctx.trace` as well (`traces.ts`). Turn Fast (Preview) off. Open a missing trace URL, or the deleted seeded trace. Expect the error page and a WARNING toast. `placeholderData: keepPreviousData` applies here too.

### `sessions.byIdWithScoresFromEvents` — WARNING, `NOT_FOUND` 404

Message `"Session not found in project"` when ClickHouse session metrics have no row.

1. Happy path: `pnpm run seed -- incident-session --id-prefix inc-4471-checkout-latency`. Open the printed session link with Fast (Preview) on. No toast.
2. Missing id, v4 on: `/project/<projectId>/sessions/missing-session-id`.
3. Postgres row without events metrics is not something the seed CLI builds on purpose. A deleted session URL is the reliable case: open the seeded session, delete it if the UI allows, reload. The throw does not care whether Postgres still has the row.

`sessions.byIdWithScores` is the v3 page (`SessionPage`), same message, thrown when the Postgres `traceSession` row is missing. It is a smaller slice than the events-path session query. Turn Fast (Preview) off and open the missing session URL.

### `cloudBilling.getSubscriptionInfo` — WARNING, `FORBIDDEN` 403

High volume, spread across many users, low repeat. `throwIfNoEntitlement` (`cloud-billing`) then `throwIfNoOrganizationAccess` scope `langfuseCloudBilling:CRUD`. Message `"Forbidden, user does not have access to this resource or action"`. Non-cloud returns a stub object and does not 403 (`isCloudBillingEnabled` false). Local will not reproduce the production 403 unless the org has the cloud-billing entitlement and the signed-in member lacks that scope.

Cloud reproduction: member or viewer who can open the org, not an owner. Page `/organization/<orgId>/settings/billing` (project settings billing redirects there). Opening the page is the action. Several billing widgets share one React Query key, so expect one toast, not one per widget.

### `v4Transition.forceV3Experience` — WARNING, `UNAUTHORIZED` 401

The handler returns a boolean. The 401 is `enforceUserIsAuthedAndProjectMember`. Any project page, because navigation calls `useForceV3Experience`.

1. Signed-out or expired session, then focus a project page that is still open. Title "Unauthorized". No custom message on the no-session throw.
2. Signed in, project id the user is not a member of: `/project/<unknown-project-id>/traces`. Message `"User is not a member of this project"`. An instance admin on a missing project gets `NOT_FOUND` / `"Project not found"` instead (see `hasTracingConfigured`).
3. Negative control: demo user on the seeded project. Query succeeds, `staleTime: Infinity`, no toast.

Failed queries still refetch on focus, so one expiry can repeat after 20 seconds.

### `traces.hasTracingConfigured` — WARNING, `NOT_FOUND` 404

A small set of users, almost all repeats. The procedure returns a boolean. It does not throw `NOT_FOUND`. `hasAnyTracingData` / `readProjectHasTracesFlag` catch database errors and return false. The `NOT_FOUND` on this route is the project middleware: instance admin, project id missing or deleted, message `"Project not found"`.

The traces, observations, and events pages set `refetchInterval: project?.hasTraces ? false : 10_000`. An admin left on `/project/<deleted-or-unknown-id>/traces` re-toasts about every 20 seconds (poll 10s, debounce 20s). That matches a small cohort seeing the same toast over and over.

Negative control: demo user, empty or populated project. The procedure returns false or true. Onboarding may show. No toast. A normal non-member gets `UNAUTHORIZED`, which is **not** the code in this PostHog row. Do not record a member-path 404 as this case.

### `observations.byId` — WARNING, `NOT_FOUND` 404

Two messages, depending on which check fails:

- Trace missing: `"Trace not found"` from `enforceTraceAccess` (`protectedGetTraceProcedure`).
- Trace present, observation missing: `"Observation not found within authorized project"`.

Seed `pnpm run seed -- support-agent --v4 --id-prefix b4c5d6e7`. Open the trace.

Negative controls (these set `meta.silentHttpCodes: [404]` and must **not** toast): the observations table generations cell, and the selected-observation panel (`useSelectedObservation` renders a missing-observation state itself). Dataset IO cells also silence 404.

Paths that do not silence, and should toast: observation prefetch on hover (`usePrefetchObservation`), log-view IO (`useLogViewObservationIO`), eval preview (`usePreviewData`), and `useParsedObservation` / add-observations-to-dataset. Hover or open an observation id that is not in the loaded tree. Also open a trace URL whose `observation` query param is a stale id.

### Network WARNING, no operation, HTTP 403

Not a tRPC `FORBIDDEN`. `fetchWithParseErrorStatus` tags a non-JSON body (`SyntaxError`) with the response status. `classifyTrpcToastError` then labels it `network` / `transient`. Title "Unexpected Response". No procedure path, because the envelope never parsed. Typical cause is a proxy or WAF HTML 403 in front of `/api/trpc`.

Not seedable. Reproduction: intercept `/api/trpc` and return HTTP 403 with an HTML body, on any signed-in page that issues a query. Distinct from an application `FORBIDDEN`, which has a procedure and title "Forbidden".

### `projectApiKeys.create` — WARNING, `BAD_REQUEST` 400, origin `frontend` / `internal`

The mutation has no `onError`. Global toast still runs. `CreateApiKeyButton` uses `mutateAsync().catch(reportNonTrpcError)`, which swallows the `TRPCClientError` and does not add a second toast. The v4 migration "create keys" button does add one (below).

Schema rejections (try each; record the title):

1. Project settings → API keys → Create. Set a custom expiry in the past. Server message `"Expiration date must be in the future"`.
2. Name that fails `StringNoHTML` (a name containing markup), if the field lets it through.
3. Role sent while the server flag is off. The form sends `role` only when `session.environment.apiKeyProjectRoleSelectionEnabled` is true. If that flag is on and `API_AUTH_MIGRATION` / `API_KEY_PROJECT_ROLES_ENABLE` are not both enabling, the refine message is `"API key role selection is not enabled"`.

If the Zod detector matches, the title becomes "Invalid input" and PostHog origin would be `backend` / `user_input`. Production rows are `frontend` / `internal` with title "Bad Request", so a local run that shows "Invalid input" has **not** reproduced the production classification. Record the title either way. The payloads are not recoverable from PostHog.

Also: v4 migration panel, "Create keys for project access" (`V4MigrationContent`). That call has no mutation `onError`, so the global toast fires, and the catch calls `showErrorToast` with operation `project_api_key.create`. Expect two cards on failure. A member without `apiKeys:CUD` gets `FORBIDDEN`, not this row.

### `organizations.delete` — WARNING, `FORBIDDEN` 403

Owner, organization settings → delete. Two bodies under the title "Forbidden":

1. Org still has a non-deleted project: `"Please delete or transfer all projects before deleting the organization."`
2. Projects are soft-deleted and the async delete has not finished: `"Deletion of your projects is still being processed, please try deleting the organization later"`. Delete the projects, then immediately delete the org.

The control is disabled without `organization:delete`, so a viewer should not reach the mutation. Success is a separate toast, operation `organization.delete`. A member without the scope who somehow calls the mutation gets the generic access string, still titled "Forbidden".

### `scores.filterOptionsFromEvents` — WARNING, `UNPROCESSABLE_CONTENT` 422

Mostly repeats from a small set of users. Scores table filter options, v4. Background query. ClickHouse resource rewrite: title "Request Timed Out" when `errorName` is `ClickHouseResourceError`, else "Unprocessable Content". Body is the advice string telling the user to narrow filters.

Seed `pnpm run seed -- outlier-traffic --days 90` or `pnpm run seed -- many-traces --count 100000 --days 14`, open the scores table, set the time range to the full seeded window. The query is ours; the user did not write it. If the local ClickHouse limit is high enough that this does not 422, say so rather than inventing a tighter limit. Same shape, smaller volume, for:

- `events.filterOptions`: events table filter options, same time-range stress.
- `sessions.metrics`: sessions table metrics query (v3 path; v4 uses `metricsFromEvents`). Open `/project/<id>/sessions` with the wide range. The table's default range is short; widen it past the seeded days.
- `dashboard.executeQuery` WARNING 422, plus a smaller ERROR 500 slice: open a dashboard whose widgets query the wide window. Preset widgets count. Some chart components pass `silentHttpCodes: [412, 422]`. The scheduler in `useDashboardQueryScheduler.tsx` sets `meta.toastOperation` to `dashboard.query`, but `resolveToastOperation` prefers the linked procedure path, so the event `operation` is `dashboard.executeQuery` and the toast still fires unless the caller also passes a silencing `meta`. Record whether the widget shows an inline error (`ChartLoadingState`), a toast, or both. The ERROR slice is HTTP 5xx (`backend` / `internal`), a server failure during the same query, not the advice string.

### `traces.getAgentGraphData` — WARNING, `UNPROCESSABLE_CONTENT` 422

Graph data for the open trace. v3 uses `traces.getAgentGraphData`; v4 uses `events.getAgentGraphData` (`TraceGraphDataContext.tsx`). The recorded volume for this heading is the v3 procedure. The query starts when the trace has observations and is under the client size threshold. No user-authored query.

Seed `pnpm run seed -- agent-graph --v4` for a dense graph, and also try with Fast (Preview) off so the v3 procedure runs: `pnpm run seed -- trace-tree --observations 5000 --depth 12 --breadth 500` (no `--v4`). Open the trace and the graph. A 422 is the ClickHouse advice toast. If the graph refuses to query because of the client threshold, that is a different (silent) path; note it.

### `dashboard.getDashboard` — WARNING, `NOT_FOUND` 404

Message `"Dashboard not found"`. Open `/project/<projectId>/dashboards/<missing-id>`, or create a dashboard, copy the URL, delete it, reload.

### `inAppAgent.listConversations` — WARNING, `FORBIDDEN` 403

`assertInAppAgentAvailable`. Production code is `FORBIDDEN`, so it is the entitlement or the org AI-features flag, not the instance-off 412.

Two clients share the procedure:

1. `useInAppAgentActivity` polls with `refetchInterval` and `refetchOnWindowFocus: true`, no silent codes, and no local toast. A project page with the activity hook mounted produces only the global WARNING: title "Forbidden", operation `inAppAgent.listConversations`. Debounce is one card per 20 seconds. This is the recorded WARNING row.
2. `InAppAiAgentProvider` runs `listConversations.useInfiniteQuery` only while the panel is `open`. `QueryCache.onError` still toasts the global WARNING, and a `useEffect` on `conversationListQuery.error` calls `showErrorToast("Failed to load conversations", errorMessage, classifyTrpcToastError(..., "in_app_agent_conversations.load"))`. That second card is an ERROR (default type) under a different operation. `fetchNextPage().catch` shows the same ERROR again when loading another page. Record both cards, and label only the WARNING as this PostHog row.

Leave a project page open where `organization.aiFeaturesEnabled` is false, or the user lacks the `in-app-agent` entitlement. High repeat from a small set of users fits the activity poll, not a send action. Local instance-off (`isInAppAgentInstanceEnabled()` false) returns 412 `"In-app agent is not enabled on this instance."`, global title "Precondition Failed", plus the ERROR "Failed to load conversations" if the panel is open. Record that as the 412 path, not the production 403 row.

### `evalsV2.update` — WARNING, `PRECONDITION_FAILED` 412

Page `/project/<projectId>/evals/<evaluatorId>` (`EvaluatorSetupPage`). Save an evaluator whose preflight fails. Messages come from `assertEvaluatorConfigurationValid` / `EvaluatorConfigurationError` (code eval disabled, unsupported language, model timeout, provider abort). Global mutation toast, so the title is "Precondition Failed" and the body is that message. No seed forces a provider timeout. Practical local case: a code evaluator when code evals are disabled ("Code evaluations are not enabled for this deployment."), or a provider/model that fails preflight. `pnpm run seed -- evaluator-gallery --count 5` only creates rows; it does not create the failing configuration.

### `members.updateOrgMembership` — WARNING, `FORBIDDEN` 403

Organization members table, role dropdown (`ConnectedMembersSettingsTable`).

1. As the only owner, change your own role away from owner. Body: `"Cannot remove the last owner of an organization. Assign new owner or delete organization."` Title: "Forbidden".
2. As a member who has `organizationMembers:CUD` but not a higher role than the target, change someone above you (`throwIfHigherRole`). Generic forbidden string.
3. Negative control: owner changes a non-owner's role. Success toast `organization_role.update`, no error toast.

Low repeat means roughly one attempt per user. The extract's code is `FORBIDDEN`, not the `NOT_FOUND` of a missing membership id.

### `projects.environmentFilterOptions` — WARNING, `NOT_FOUND` 404

The procedure body (`getEnvironmentsForProject`) does not throw `NOT_FOUND`. It returns environment strings, and always includes `"default"`. The `NOT_FOUND` is `enforceUserIsAuthedAndProjectMember`: instance admin, project id missing or soft-deleted, `"Project not found"`. The shared cache hook (`use-environment-filter-options-cache.tsx`) and the scores / observations / users tables fire it when they mount.

Reproduction: instance admin, open a table on `/project/<deleted-or-unknown-id>/...` (scores or observations). A normal member gets `UNAUTHORIZED`, which is not this row. `refetchOnWindowFocus` is false on the cache hook; repeat comes from remounts after the cache TTL, or from tables that do not use the cache.

### `prompts.metrics` — ERROR, `INTERNAL_SERVER_ERROR` 500

Page `/project/<projectId>/prompts`, with at least one prompt so the metrics query is enabled (`prompts-table.tsx`, no silent codes). The query runs by itself to fill count columns. A 500 is a server bug (`backend` / `internal`). There is no seed that throws 500. Video: open the prompts page on current `main` and record whether it toasts. If it does not, the production 500 is not reproduced; do not inject a fault unless a later task asks for one. Almost all repeats from a handful of users means a retry/refocus loop on a broken query, not a form submit.

### `playground.execute` — ERROR, no tRPC code

`web/src/features/playground/page/context/index.tsx` catch: `showErrorToast("Error", err.message, { operation: "playground.execute", ... })`. Not a tRPC failure, so `trpcCode` and `httpStatus` are empty. Origin is `backend` / `internal` unless the throw is a `TypeError` (then `network` / `transient`).

Page `/project/<projectId>/playground`. Add a message, pick a model whose provider call fails (no API key, or a bad base URL). Title "Error", body is the thrown message.

Separate, smaller path in `useWindowCoordination.ts`: no messages → `"No content to execute"` / `"Please add at least one message..."`, origin `frontend` / `user_input`. Missing model is intentionally not toasted (the page already shows a banner). The application ERROR events on the playground URL with no operation are this catch from before 12 Oct.

### `evaluator.reactivate` — ERROR, `PRECONDITION_FAILED` 412

Same page as update. Reactivate a blocked evaluator. Local `onError` replaces the global toast and calls `showErrorToast("Reactivation failed", error.message, ...)` with default type `ERROR`, so a 412 shows as a red ERROR card, not a WARNING. Code-eval blocked evaluator: `"Only LLM and decision-model evaluators can be reactivated with a model test."` Model preflight failure: the message from `getEvaluatorDefinitionPreflightError` / `getDecisionModelConfigurationError`. Success is `"Evaluator reactivated"`.

### `verified_domain.verify` — ERROR

`ConnectedVerifiedDomainsSettingsTable` calls `showErrorToast` (default type `ERROR`). Server `verifiedDomainRouter` returns `PRECONDITION_FAILED` when the DNS TXT record does not match, and also when the DNS lookup throws. Page: organization settings → verified domains. Add a domain you control and click verify before the TXT record exists, or use a name that does not resolve. A lookup failure is our/network side, coded as precondition, shown as an ERROR titled by the explicit toast (not by `errorTitleMap`, because this call does not go through `trpcErrorToast`).

### `playground_window.add` and `remote_experiment.trigger`

Small ERROR tails, well below the cases above. `playground_window.add` is an explicit playground toast (add a window in a state the handler rejects). `remote_experiment.trigger` is `RemoteExperimentTriggerModal` / dataset remote experiment; a server `BAD_REQUEST` on `datasets.triggerRemoteExperiment` is classified `user_input` because that path is on `EXPECTED_TRPC_BAD_REQUEST_PATHS`. Open a dataset, trigger a remote experiment with a configuration the server rejects, and record the card. Not enough volume to treat as a primary case.

### Operation-less ERROR on traces, playground, and evals

Do not try to reproduce "missing operation" on today's build. Section 4 is the explanation. For the video, use the mapped cases above.

## 7. In-context patterns that already exist

Descriptive only. These are places the toast is already suppressed or a failure is already drawn in the page.

- `meta.silentHttpCodes` / `meta.silentAllErrors` on specific queries: events table 422, observations table and selected observation 404, dataset IO cells 404, several dashboard charts 412/422, SSE dashboard `silentAllErrors`, skills and session transcripts `silentAllErrors`, automations / prompt detail / media / table-view presets 404, evaluators list 503. `useTrpcError` exposes `isSilentError` for those surfaces.
- `useSelectedObservation` renders a missing observation and silences the 404.
- `ErrorPage` / `ErrorPageWithSentry` (`web/src/components/error-page.tsx`): centered message, sign-in when unauthenticated, optional extra button. Trace v3 not-found uses it. It does not toast; the query toast is separate.
- Design-system `Alert` (`web/src/components/design-system/Alert/Alert.tsx`): default, destructive, info, warning.
- Optimistic update with rollback: `web/src/components/publish-object-switch.tsx` (public/share switch updates trace, event, and session caches, rolls back on error, and toasts via `trpcErrorToast` on failure).
- Forms use field errors in many dialogs. The API-key dialog disables submit for an empty name or unresolved expiry; a server rejection of that same form still uses the global toast.

The default remains the global toast. Inline handling is opt-in per query or per mutation `onError`.

## 8. High-volume success toasts

Included so the operation strings in the extract map to a button. Ordered from most frequent to less frequent. Not a judgment about whether they should exist.

| `operation` | Where it fires |
| --- | --- |
| `export.queue` | `BatchExportTableButton`: "Export queued", link to `/project/:id/settings/exports`. |
| `trace.bulk_delete` | `TracesTable`, `EventsTable`: "Traces deleted". |
| `widget.update` | `EditWidgetPage`. |
| `evaluator.save` | `EvaluatorSetupPage`. |
| `trace_log.copy` | `useLogViewDownload` (log view copy). |
| `prompt.copy` | `useCopyMigrationPrompt` in `V4MigrationContent`: "Prompt copied" / "Paste it into Cursor, Codex, or another coding agent." This is the v4 coding-agent prompt, not copying a Langfuse prompt. Prompt-management copy is `onboarding_prompt.copy`. |
| `widget.create` | `NewWidgetPage`. |
| `experiment.trigger` | `prompt-detail.tsx`, `DatasetExperimentsPage`. |
| `organization_role.update` | Members table, org role. |
| `dashboard.create` | `NewDashboardPage`. |
| `sharing.enable` | `useShareMenuItems`, publish switch. |
| `monitor.update` / `monitor.create` | `MonitorForm`. `monitor.update` is the more frequent of the two. |
| `remote_experiment.trigger` | `RemoteExperimentTriggerModal`. |
| `project_role.update` | Members table, project role. |
| `user_feature_preview.update` | Feature preview modal / popover. |
| `model.create` | `UpsertModelFormDialogController`. About as frequent as `user_feature_preview.update`. |
| `score.bulk_delete` | `ScoresTable`. |
| `saved_view.update` | `useViewMutations`. |
| `evaluator.bulk_delete` | `EvaluatorsPage`. |
| `dataset.bulk_delete` | `DatasetsTable`. |
| `evaluation_rule.update` | Evaluation rule save. |
| `organization.delete` | `DeleteOrganizationDialogController` success, after the FORBIDDEN cases in section 6 are cleared. Slightly more frequent than `evaluation.queue`. |
| `evaluation.queue` | `RunEvaluationDialog`. |

## 9. What this extract cannot show

- Toast title and body. They are not on the event. The titles in this note are what `errorTitleMap` and the explicit `showErrorToast` calls produce for the recorded code.
- Which of the `projectApiKeys.create` schema checks failed. Origin `frontend` / `internal` only says the Zod detector did not match.
- A per-user proof that the `hasTracingConfigured` users were instance admins. That is the only `NOT_FOUND` on that procedure's middleware; a member would be `UNAUTHORIZED`. The extract is a small set of users with almost every event a repeat, which fits an admin left on a deleted project, and it is not proven from user ids.
- The exception text of the operation-less ERROR events.
- Whether `query.execute` / `mutation.execute` started appearing after the 12 Oct deploy. The flag was never true in this window.
