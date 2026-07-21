---
name: sentry-instrumentation
description: |
  Capture errors in Langfuse with Sentry deliberately, and decide whether a new
  error path should report at all. Use when (1) adding or touching any
  `captureException`, `console.error`, error boundary, `catch` block, Worker
  `onerror`, or tRPC/REST error handler in `web/**` — pause and decide capture
  before finishing; (2) adding or reviewing a Sentry `beforeSend` filter,
  denylist rule, `ignoreErrors`, `denyUrls`, or any noise-suppression change
  (MANDATORY here — the review question is "does this rule hide a real
  error?"); (3) asked to reduce Sentry noise, triage a Sentry issue, or answer
  "why is X / isn't X in Sentry"; (4) rendering user-supplied content (URLs,
  hrefs) through a framework primitive that may reject it and log an error.
---

# Sentry Instrumentation

**One idea:** an event in Sentry is a **promise that a human should act.** If
nobody would act on it, do not send it. If you send it, make it **legible** (a
real `Error` with a stack — never a string/object/SyntheticEvent) and
**routable** (an `area` tag, a message stable enough to group). Sentry is not a
log sink; the server-side observability stack is where firehose logs live.

## Decide capture when adding an error path

When adding or changing an error path in `web/**`, decide explicitly whether it
should reach Sentry — do not `captureException` (or `console.error`) reflexively.
Run the decision tree, then say in one line what you chose and why (in the plan
or PR description). The three outcomes:

| The failure is… | Do | Never |
|---|---|---|
| an **expected user-facing state** — a missing/forbidden resource, expired session, invalid user input, a malformed URL in user content | render the UX (error page / toast / plain text) | capture — it is the product working as designed |
| a **transport / offline / infra** failure — fetch failed, a 5xx on a poll, an LB blip | let the UI degrade; the server owns this signal | capture client-side — it is an amplified, lower-fidelity copy of a server truth |
| **our code failed** — an invariant broke, a parse threw, a worker failed to load | `captureException` a **real `Error`** with an `area` tag via the shared helpers | pass a raw string/object/`Event` |

**`console.error` is a capture API here.** `instrumentation-client.ts` enables
`captureConsoleIntegration({ levels: ["error"] })`, so **every `console.error`
becomes a Sentry event.** Logging an object yields an opaque `[object Object]`
fingerprint; logging non-actionable info still mints an issue. For
non-actionable logging use `console.warn`; to report a real failure, capture it
properly (below).

## The Langfuse pattern (match it exactly)

- **Report caught unknowns through the shared helpers, not raw
  `captureException`:**
  - [`captureUnknownError(context, value, extra?)`](../../../web/src/utils/captureUnknownError.ts)
    — turns any caught value into a legible `Error` (real `Error`s pass through
    with their stack; everything else is synthesized), tags `area`, and logs via
    `console.warn` so the console integration does not double-capture.
  - [`reportParserWorkerError(hook, event)`](../../../web/src/hooks/parserWorkerError.ts)
    — extracts the real fields from a Worker `ErrorEvent` (message/filename/lineno)
    instead of stringifying it to `[object ErrorEvent]`.
- **Filter predicates belong in
  [`web/src/utils/sentryFilters.ts`](../../../web/src/utils/sentryFilters.ts)**
  (documented, unit-tested), called from `beforeSend` in
  [`web/instrumentation-client.ts`](../../../web/instrumentation-client.ts) (the
  only `Sentry.init` in the codebase — `beforeSend`,
  `captureConsoleIntegration`, `denyUrls`, replay masking). Add every new filter
  as a named predicate there, never as an ad-hoc inline check. `beforeSend`
  still carries a couple of legacy inline checks (invalid-href, React-devtools)
  that predate this convention and read only the exception value — migrate those
  into named, all-field predicates; do not add more inline checks.
- **Classify tRPC errors at the seam,** not per call site: `handleTrpcError`
  ([`web/src/utils/api.ts`](../../../web/src/utils/api.ts)) is the single
  chokepoint every query/mutation error flows through — the place to drop
  expected codes and tag the rest (the seam-classification lever, PR #15243).
- **Tag `area`, keep the message static.** `captureException(err, { tags: { area },
  extra })`. Fingerprints group on the message, so put variable IDs in `extra`,
  never in the message string.

## The rules (each earned the hard way — cited to workstream PRs)

> PR references name the **lever** that established each pattern. Verify a cited
> symbol or swap against the current tree before relying on it — the code, not
> this doc, is the source of truth.

1. **An event is a promise a human acts — expected states are not events.**
   A `NOT_FOUND` / `FORBIDDEN` / `UNAUTHORIZED` the UI already renders is not a
   regression. ⚠ `TRPCClientError: Trace not found` was the #2 issue by volume
   (~30k events); PR #15243 drops those at the tRPC seam and switches the
   "Project Not Found" state (which captured on every mount via
   `ErrorPageWithSentry`) to the non-capturing `ErrorPage`.

2. **Capture a REAL `Error`, never a string / object / `SyntheticEvent` /
   `ErrorEvent`.** Those collapse to opaque `[object Object]` / `[object
   ErrorEvent]` fingerprints with no stack. ⚠ The 5EX cluster (opaque non-Error
   captures, PR #15175) and the parse-worker `[object ErrorEvent]` family (PR
   #15173) were exactly this. Route unknowns through `captureUnknownError` /
   `reportParserWorkerError`.

3. **`console.error` mints a Sentry event — pick the level deliberately.** Use
   `console.warn` for non-actionable logs (the #15173 pattern); use
   `captureException` for real failures. Never `console.error(someObject)`.

4. **Client transport failure ≠ app bug — do not amplify server/infra state.**
   One LB 502 or a poll blip becomes thousands of browser events. ⚠ The 418
   `HTTP Client Error` saga (~44k events → 8/24h after scoping the httpClient
   integration, PR #15145) and the next-auth `CLIENT_FETCH_ERROR` /
   `Failed to fetch` families (denylist, PR #15238). The real outage is visible
   server-side; the client copy is noise.

5. **Root-cause at the source beats a filter.** Prefer eliminating the emission
   over suppressing the event. ⚠ User-content markdown URLs rendered through a
   Next.js `<Link>` logged `Invalid href … passed to next/router` (~40k events)
   — note `getSafeLinkUrl` does NOT prevent this: a malformed-but-parseable URL
   (a second `https://` → repeated `//`) passes validation and `<Link>`'s router
   still rejects it. PR #15245 renders these as a native `<a>` (which never runs
   the router's href validation), removing the family at the source — no new
   filter needed. (The older inline `beforeSend` invalid-href check is redundant
   and never fired anyway — it read the wrong field, Rule 6 — so it can be
   retired.)

6. **Every `beforeSend` / denylist rule: narrow signature + written rationale +
   a NEGATIVE fixture proving a real error still passes.** This is the MANDATORY
   review gate — for any suppression change, answer "does this rule hide a real
   error?" in the PR, and add a test asserting a real 5xx / unknown code / thrown
   error is NOT dropped (the `sentryFilters.clienttest.ts` pattern from #15145 /
   #15238). ⚠ **Read the right event field:** message-type events (console
   captures, benign strings) carry their text on `event.message` /
   `event.logentry.message`, NOT `event.exception.values[0].value` — a filter
   that only reads the exception value silently never fires on them (the reason
   the original invalid-href filter never worked).

7. **PII — never put user content in a message, `extra`, or tag.** No prompt
   text, trace content, tokens, share-link secrets, user/session ids. Respect
   the replay masking already configured for HIPAA/regions in
   `instrumentation-client.ts`. A message that interpolates user data both leaks
   and shatters grouping (Rule 5).

8. **VERIFY in the environment that actually fires the error.** Router/console
   validations run only in the **real client runtime, not jsdom** — a green unit
   test does NOT prove the console error is gone. Reproduce it in a browser
   against the running app (Playwright), do an A/B, and confirm the event
   disappears. ⚠ PR #15245 was verified this way — its native `<a>` fired 0
   where the prior `<Link>` fired the error ×12. Unit tests lock the *contract*; the
   browser proves the *noise removal*.

## Workflow

1. **Classify (tiny).** For the error path, name the outcome — expected /
   transport / our-code — and write the one-line decision. That IS the PR note.
2. **Wire it.** Expected → render UX (no capture). Transport → degrade (no
   capture). Real → `captureException` a real `Error` via the helpers, with an
   `area` tag, static message, structured `extra`, no PII.
3. **If suppressing:** add a named predicate in `sentryFilters.ts` reading the
   right event field, with a written rationale and a negative fixture (Rule 6).
   Prefer root-causing the emission instead (Rule 5).
4. **Verify** — unit test for the contract; **browser A/B** for the actual
   event removal (Rule 8).
5. **PR** with the decision note; for suppression changes, the explicit
   "does this hide a real error?" answer + the negative-fixture test.

## Anti-patterns

- Capturing an expected 404 / permission / validation / malformed-user-input
  state (Rule 1).
- `captureException(nonError)` or `console.error(object)` → opaque fingerprint
  (Rules 2, 3).
- Re-reporting transport/infra failures the server already owns (Rule 4).
- Adding a `beforeSend` filter with no rationale, no negative fixture, or one
  that reads the wrong event field (Rule 6).
- Interpolating ids/user data into the message → PII + grouping explosion
  (Rules 5, 7).
- Trusting a green jsdom test as proof the noise is gone (Rule 8).
- An ad-hoc inline `beforeSend` check instead of a named, tested predicate in
  `sentryFilters.ts`.

## References

- [references/sentry-capture-contract.md](references/sentry-capture-contract.md)
  — the capture contract in depth: the shared-helper APIs, the beforeSend /
  denylist authoring protocol (field-reading, negative fixtures), fingerprinting
  and `area` tagging, the known noise families, and the shipped-PR case studies
  (#15145 / #15173 / #15174 / #15175 / #15238 / #15243 / #15245). Read when
  authoring a suppression rule, hardening a capture path, or triaging a family.
