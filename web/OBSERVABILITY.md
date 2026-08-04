# Observability: the Sentry capture contract

How client-side errors in `web` report to Sentry, and how to decide whether
yours should. Read this before adding a `captureException`, a `console.error`,
an error boundary, or a Sentry filter — and when wondering "why isn't X in
Sentry?".

## The contract

**An event in Sentry is a promise that a human should act.** If nobody would
act on it, do not send it. The unresolved stream is an actionable backlog, not
archaeology: every issue in it should be a real defect someone can pick up.
Sentry is not a log sink — firehose logging belongs to the server-side
observability stack.

Scope: the browser SDK is the only **initialized** Sentry SDK. The only
`Sentry.init` is [`instrumentation-client.ts`](instrumentation-client.ts);
neither the web server nor the worker initializes one. `withSentryConfig` in
`next.config.mjs` is build tooling (source-map upload, component annotation),
not a runtime init, and the few `@sentry/nextjs` helpers reachable during
server rendering (e.g. `_error.tsx`) are inert without an initialized SDK
(`isEnabled()` returns false). So if you are investigating a backend error, it
lives in the server-side observability stack, not Sentry — whether backend
errors should also report to Sentry is a separate, pending decision.

## Should this error path capture?

| The failure is…                                                                                                             | Do this                                                     | Never                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| an **expected user-facing state** — missing/forbidden resource, expired session, invalid input, malformed URL in user content | render the UX (error page / toast / inline message)         | capture — the product is working as designed                                           |
| a **transport / offline / browser-environment** failure — fetch failed, a 5xx on a poll, a browser extension interfering      | let the UI degrade; the server owns that signal              | capture client-side — it is an amplified, lower-fidelity copy of a server-side truth   |
| **our code failed** — an invariant broke, a parse threw, a worker failed to load                                              | report a **real `Error`** via the helpers, with an `area` tag | pass a raw string / object / `SyntheticEvent`                                          |

State the decision in one line in your PR ("expected state, renders a toast,
no capture").

## console.error is a capture API

`instrumentation-client.ts` enables
`captureConsoleIntegration({ levels: ["error"] })`, so **every `console.error`
becomes a Sentry event**. Logging an object mints an opaque `[object Object]`
issue with no stack; logging non-actionable info still mints an issue. Use
`console.warn` for non-actionable logging. The capture helpers below log their
companion console line at `warn` for exactly this reason — so the same failure
is not captured twice.

## How to capture

Route through the shared helpers instead of raw `captureException`:

- [`reportError(error, { area, expected?, extra? })`](src/utils/reportError.ts)
  — the capture seam for new code. Coerces any caught value into a legible real
  `Error` (real `Error`s keep their stack), tags `area` so issues route by
  surface, logs at `warn`. With `expected: true` it drops a breadcrumb instead
  of capturing.
- [`captureUnknownError(context, value, extra?)`](src/utils/captureUnknownError.ts)
  — legacy wrapper over the same seam, kept for existing call sites.
- [`reportParserWorkerError(hook, event)`](src/hooks/parserWorkerError.ts) —
  for Worker `onerror` `ErrorEvent`s; extracts message/filename/lineno instead
  of stringifying to `[object ErrorEvent]`.

tRPC errors are already classified centrally: `handleTrpcError` in
[`src/utils/api.ts`](src/utils/api.ts) drops expected codes (`NOT_FOUND`,
`FORBIDDEN`, `UNAUTHORIZED`) with a breadcrumb and tags the rest with
`trpc.code` / `trpc.path`. Do not re-capture tRPC errors at call sites.

### Grouping

Sentry groups by message. Keep the message **static** and put variable ids in
`extra` — `` `Trace ${id} not found` `` mints a new issue per id. When a
message legitimately must vary, set an explicit `fingerprint`. One standing
policy: stale-deploy chunk parse errors are collapsed into a single
`stale-chunk-parse-error` fingerprint rather than dropped (rule in
[`src/utils/sentryFilters.ts`](src/utils/sentryFilters.ts)) — never archive
that issue forever; a spike in it is a deploy canary.

## Adding or removing a suppression rule

All filter predicates live in one home:
[`src/utils/sentryFilters.ts`](src/utils/sentryFilters.ts), called from
`beforeSend` in `instrumentation-client.ts` — which holds no inline checks;
keep it that way. Every rule must have:

1. **A named predicate** keyed on a narrow signature — the exception
   `mechanism.type`, a whole-message match, or an anchored prefix. Never a
   loose `includes` that could match a real error.
2. **A written rationale** in a comment: why this signature cannot be a real,
   actionable error, and where the real signal still lives (usually
   server-side).
3. **A negative fixture** in `sentryFilters.clienttest.ts` proving a real error
   — a genuine 5xx, an unknown code, a thrown `Error` — still passes.

Read the right event field: console captures and message events carry their
text on `event.message` / `event.logentry.message`, not on
`event.exception.values[0].value` — a predicate that reads only the exception
value silently never fires on them.

Expect skeptical review on any suppression change: the PR must answer "does
this rule hide a real error?". Prefer fixing the emission at the source over
filtering the event — a removed error family needs no rule at all. And verify
noise removal in a real browser: router and console validations do not run in
jsdom, so a green unit test alone does not prove the event is gone.

## PII and compliance

Never put user content — prompt or trace text, tokens, share-link secrets,
user/session ids — in an event message, `extra`, or a tag. A message that
interpolates user data both leaks it and shatters grouping. Session replay
masking in `instrumentation-client.ts` (`maskAllText` / `blockAllMedia`,
active everywhere except the EU/US non-HIPAA cloud regions) must never be
loosened: error-event PII discipline is part of the compliance boundary.

## Related machinery

- **Releases + source maps:** events carry the build id as their release
  (`release: NEXT_PUBLIC_BUILD_ID` in `instrumentation-client.ts`), and
  production source maps are uploaded with debug IDs (`next.config.mjs`), so
  minified stacks symbolicate and an issue can be attributed to the deploy
  that introduced it.
- **Version-update banner:** long-lived tabs on a stale bundle 404 on
  code-split chunks after a deploy;
  [`src/features/version-update`](src/features/version-update) shows a
  persistent "reload to update" banner (never auto-reloads) to shrink that
  noise family at the source.
- **The full protocol** — helper APIs, filter-authoring details, and the case
  studies behind each rule — lives in the agent-facing skill:
  [`.agents/skills/sentry-instrumentation/`](../.agents/skills/sentry-instrumentation/SKILL.md).
