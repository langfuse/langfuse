# Sentry capture contract — depth reference

Load when authoring a `beforeSend`/denylist rule, hardening a capture path, or
triaging a noise family. Read the [SKILL.md](../SKILL.md) first — this file is
the detail behind its rules.

## Contents

- [Where Sentry is wired](#where-sentry-is-wired)
- [The shared capture helpers](#the-shared-capture-helpers)
- [beforeSend / denylist authoring protocol](#beforesend--denylist-authoring-protocol)
- [Fingerprinting, tagging, messages](#fingerprinting-tagging-messages)
- [Known noise families](#known-noise-families)
- [Workstream levers (case studies)](#workstream-levers-case-studies)

## Where Sentry is wired

- **The only `Sentry.init`** is [`web/instrumentation-client.ts`](../../../../web/instrumentation-client.ts)
  — client-side only. It configures `beforeSend`, `captureConsoleIntegration({ levels: ["error"] })`,
  `httpClientIntegration()`, `replayIntegration(...)` (masking gated on region/HIPAA),
  and `denyUrls` (browser-extension origins).
- **The worker and web server have no Sentry SDK** — backend signal lives in the
  server-side observability/APM stack, not Sentry. Do not assume a backend error
  reaches Sentry; it does not. (Treat "Sentry = frontend-only" until a decision
  says otherwise.)
- **Filter predicates** live in [`web/src/utils/sentryFilters.ts`](../../../../web/src/utils/sentryFilters.ts)
  with unit tests in `sentryFilters.clienttest.ts`; `beforeSend` only calls
  these named predicates and holds no inline checks (the former invalid-href
  and React-devtools inline checks were removed / migrated to
  `isReactDevtoolsInternalEvent` in #15276). Add new filters only as predicates
  here, never inline.
- **The tRPC seam** is `handleTrpcError` in [`web/src/utils/api.ts`](../../../../web/src/utils/api.ts):
  every query/mutation error flows through it — the single place to classify.
  PR #15243 drops expected `data.code`s (`NOT_FOUND` / `FORBIDDEN` /
  `UNAUTHORIZED`) there with a breadcrumb and tags the rest
  (`trpc.code` / `trpc.path`).

## The shared capture helpers

Prefer these over a raw `captureException`:

```ts
// A caught value of unknown shape (catch block, rejected promise, event handler).
captureUnknownError("io-parse", value, { traceId }); // real Error passes through; else synthesized. tags:{area}, warns (no double-capture)

// A Web Worker onerror ErrorEvent (script failed to load / threw during init).
reportParserWorkerError("useJsonParse", event); // extracts message/filename/lineno; tags:{area:"io-parse-worker"}
```

Both log via `console.warn` (not `console.error`) on purpose — `console.error`
would be re-captured by `captureConsoleIntegration` as a second, opaque event.

If you must capture directly: pass a real `Error`, add `{ tags: { area }, extra }`,
keep the message static, and log any companion console line at `warn`.

## beforeSend / denylist authoring protocol

A suppression rule is a loaded gun aimed at your own signal. Every rule:

1. **Is a named predicate in `sentryFilters.ts`** (e.g. `isNoisyHttpClientPollEvent`),
   never an inline check in `beforeSend`.
2. **Keys on an unambiguous signature** — the Sentry-set exception `mechanism.type`,
   a whole-message match, or a `startsWith`-anchored prefix. Never a loose
   `includes` that could match a real error.
3. **Reads the right event field.** Exception events carry text on
   `event.exception.values[0].value`; **message events (console captures, benign
   strings, `[next-auth]` logs, `Invalid href …`) carry it on `event.message` or
   `event.logentry.message`.** A predicate must coalesce all three
   (`exception value ?? event.message ?? event.logentry?.message`) or it silently
   never fires on message events — the exact bug that left the original
   invalid-href filter dead.
4. **Has a written rationale** in a comment: why this signature cannot represent
   a real, actionable error, and where the real signal still lives (usually
   server-side).
5. **Has a NEGATIVE fixture** in `sentryFilters.clienttest.ts` proving a real
   error still passes — a 5xx / unknown code / genuine thrown Error must return
   `false` from the predicate.

Prefer **root-causing the emission** over a filter whenever the source is a
small, identifiable set of call sites (see Rule 5 / the invalid-href case).

## Fingerprinting, tagging, messages

- **Static message → correct grouping.** Sentry groups by message; an
  interpolated id (`Trace ${id} not found`) mints a new fingerprint per id.
  Keep the message constant; put variability in `extra`.
- **`area` tag** on every real capture (`tags: { area: "io-parse-worker" }`) so
  issues route/group by surface. The tRPC seam adds `trpc.code` / `trpc.path`.
- **Explicit `fingerprint`** only when a message legitimately must vary and you
  still want one group — set it on the scope; do not rely on the default.

## Known noise families

The recurring shapes and their correct disposition:

- **Expected tRPC codes** — `Trace not found` (NOT_FOUND), `not a member`
  (FORBIDDEN), expired session (UNAUTHORIZED). → dropped at the seam (#15243).
- **Transport / next-auth** — `Failed to fetch`, `[next-auth] CLIENT_FETCH_ERROR`,
  poll 5xx. → server owns the signal; scoped/denylisted (#15145, #15238).
- **Opaque non-Error captures** — `[object Object]`, `[object ErrorEvent]`,
  "Object captured as exception". → capture a real Error via the helpers
  (#15173, #15175).
- **User-content URL validation** — `Invalid href … passed to next/router`. →
  render user URLs as native `<a>`, not a framework `<Link>` (#15245).
- **Perf detectors / third-party** — N+1, HTTP-overhead `info` issues, browser
  extensions, crawlers. → Sentry project settings (inbound filters, detectors),
  not code.
- **Stale-deploy** — chunk 404s, `importScripts` failures, version-skew. → a
  reload-on-new-version prompt + release-aware handling (open work).

## Workstream levers (case studies)

Each row names the PR that established the pattern; verify a cited symbol/swap
against the current tree before relying on it.

| PR | Family | Lever |
|---|---|---|
| #15145 | 418 httpClient poll 5xx (~44k→8/24h) | `isNoisyHttpClientPollEvent` (mechanism + path) |
| #15173 | parse-worker `[object ErrorEvent]` | `reportParserWorkerError` (real Error) |
| #15174 | JSON-viewer meta-root offsets (456) | fingerprint/render fix |
| #15175 | opaque non-Error captures (5EX) | `captureUnknownError` (real Error) |
| #15238 | transport / next-auth / benign (~1.9k/24h) | `isDenylistedNoiseEvent` in `sentryFilters.ts` — reads all event fields, negative fixtures |
| #15243 | expected tRPC codes (54F #2, ~30k) | `handleTrpcError` classify + breadcrumb + tags |
| #15245 | `Invalid href` (5DZ/5EA/5ER, ~40k) | native `<a>` at the source |

Each is a worked example of one rule: prefer real Errors, prefer root-cause over
filter, read the right field, keep a negative fixture, verify in the browser.
