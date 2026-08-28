---
name: posthog-instrumentation
description: |
  Product analytics with posthog.
  Use when adding a meaningful user action or feature in `web/**`, touching PostHog capture code,
  changing session replay or its privacy boundaries, or answering product-usage questions.
---

# PostHog Instrumentation

**One idea:** every event exists to answer a **question** ("how do people
filter?", "v3 vs v4?"), and it captures **shape/metadata — NEVER raw values.**
If you cannot name the question an event answers, do not add it. If a property
could contain user content, that is a bug.

## Propose instrumentation when adding a frontend action

When adding a meaningful user action to `web/**`, decide explicitly whether it
should emit an event — do not skip the question silently.

- **Meaningful:** a new feature surface, a funnel step (open → configure →
  submit), an adoption signal the team would act on, a mode/view switch that
  segments behavior.
- **Not meaningful:** styling, refactors, hover states, programmatic state
  changes, anything autocapture-grade. Capture the critical path, not
  everything — event bloat is an anti-pattern.
- If meaningful: write a one-line tracking plan (question → event → props →
  key dimension) and include it in the plan or PR description. If deliberately
  not instrumenting, say so in one sentence.

## The Langfuse pattern (match it exactly)

- **Hook:** `usePostHogClientCapture()` → `capture(eventName, props?)`
  ([`usePostHogClientCapture.ts`](../../../web/src/features/posthog-analytics/usePostHogClientCapture.ts)).
  The component calls the hook's `capture` — it never imports or touches
  `posthog` directly. The only client-side exceptions are app-shell
  infrastructure in `_app.tsx` (`$pageview`, `identify`, `register`).
- **Names = `resource:action`, snake_case action.** Enforced by the typed
  registry — the `events` object + `EventName` type in that file. **New events
  MUST be added to the registry or they will not typecheck** (e.g.
  `saved_views:view_selected`, `table:filter_builder_open`). Names are static
  strings only — never interpolate (a `page_view_${name}` explodes into
  un-analyzable definitions). Event names cannot be renamed after they exist —
  version instead (`…_v2`).
- **Props: camelCase, metadata-only.** IDs of enums / counts / booleans /
  lengths — never content. Property naming: `objectAdjective` (`filterType`,
  `valueCount`), `is`/`has` prefix for booleans (`isV4`, `hasFreeText`),
  `Date`/`Timestamp` suffix for times.
- **Global dimensions** ride as a **super property** registered once in
  [`_app.tsx`](../../../web/src/pages/_app.tsx) (e.g. `v4BetaEnabled` via
  `posthog.register`, removed on sign-out via `posthog.unregister`) so they
  attach to every event. Also put a per-event copy on events where the value
  at the moment of the action matters (Rule 4). For org/project-level
  segmentation, PostHog group analytics is the documented mechanism — see
  [references/posthog-code-patterns.md](references/posthog-code-patterns.md) §4.
- **Server-side events are separate.** A few server paths capture via
  `ServerPosthog` (e.g. `cloud_signup_complete`, playground analytics) with
  event names distinct from any frontend event — keep it that way; reusing a
  name across client and server double-counts.
- **The HIPAA region runs NO product analytics.** Both entry points gate on
  [`productAnalyticsAvailability.ts`](../../../web/src/features/posthog-analytics/productAnalyticsAvailability.ts):
  the browser SDK (`posthog-js`) is only initialized when
  `getPostHogClientConfig()` returns a config — `init()` itself fetches remote
  config, so skip it rather than opting out after. The server SDK
  (`posthog-node`, via `ServerPosthog`) is constructed as usual, then
  `disable()`d when `isProductAnalyticsAvailable()` is false. Missing env vars
  are NOT a gate — `ServerPosthog` falls back to Langfuse's telemetry key.
  Never add a per-call-site region list, and never construct a PostHog client
  that bypasses that module.

## The 6 rules (each earned the hard way on LFE-10781 / PR #14929)

1. **PRIVACY is rule #1 — metadata only, never raw values.** Safe: `type`,
   `column`, `operator`, `key` (a field _name_, not a value), counts
   (`valueCount`, `conditionCount`), lengths (`queryLength` = char count, NOT
   the text), enums (`trigger`, `reason`), `tableName`, booleans. **Never:**
   the raw filter `value`, search text, the AI prompt, userId/sessionId,
   metadata content, tag names.
   ⚠ _Real leak:_ `table:filter_builder_close` sent `{ filter: filterState }`
   — the whole filter including values → PII in PostHog. Fixed to
   `{ filterCount }` in #14929. **Grep any event you touch for a raw value.**
   💡 _How PostHog itself keeps PII out_ (see
   [references/posthog-code-patterns.md](references/posthog-code-patterns.md) §2):
   not SDK denylists — the **payload only accepts metadata**. Encode
   "counts/lengths/booleans/enums only" into parameter **types** (raw content
   → a type error) and shared `sanitize*()` helpers for complex objects.
   Reserve a client-side `before_send` hook for _last-mile secrets_ (tokens in
   URLs/share links) and for disabling capture on publicly-embedded views —
   a backstop, not the primary defense.

2. **Instrument the INTENT seam, not the low-level setter.** Capture in the
   per-action function the user triggered (`updateFilter`, `updateOperator`,
   `commit`), NOT the shared state setter (`setFilterState`) — the setter also
   fires on programmatic restores (saved views, URL nav, defaults) →
   double-count / phantom events. Find the function that maps 1:1 to "the user
   did X".

3. **Fire once per action — dedup.** Guard no-op triggers (a blur with no
   change must NOT emit). When one emitting handler nests another (e.g. an
   operator toggle that internally calls updateFilter), use a suppress-ref so
   it emits once. Beware stale refs in external-sync effects that commit via
   the raw setter and leave a baseline count stale → the next edit mis-fires.

4. **Carry the key segmentation DIMENSION on every event — and make sure it is
   actually populated.** For Langfuse the headline dimension is **v3 vs v4
   (fast mode)** — filtering (and much else) behaves very differently across
   them. Put `isV4` on every relevant event, derived from the surface **at the
   moment of the action** (v4 events table / grammar search bar → true;
   v3/legacy → false; shared components → from the table/view context).
   ⚠ _Real P1:_ a component-level `isV4`/`tableName` prop that defaults to
   `"unknown"`/`false` is worthless if callers do not forward it — **forward
   it from EVERY call site and verify the emitted event carries the real
   value, not the default.** The super property is a global backstop, not the
   only source.

5. **Cover every sub-path of a surface.** A "filter applied" event that only
   fires for some facet kinds is a silent hole. ⚠ _Real gap:_ keyed-facet
   handlers (metadata / scores) called the setter directly and emitted nothing
   — on exactly the surfaces we most wanted data. **Enumerate a surface's
   actions and confirm each emits.**

6. **VERIFY LIVE — intercept the real capture calls; do not assume.** Spy on
   `window.posthog.capture` (or the network POST to the PostHog ingest
   endpoint) with Playwright and assert: (a) the action fires the event
   **exactly once** (no double-count, no blur-refire); (b) the **key dimension
   is present and correct** (contrast a v4 surface vs a v3 surface → `isV4`
   true vs false); (c) **PRIVACY — dump every payload and confirm NO raw value
   / search text / prompt / id appears.** A green typecheck ≠ correct
   analytics; the dimension-populated and privacy checks catch the real bugs.

## Session replay privacy

Treat session replay as a separate data-export surface from analytics events.
Apply these rules when changing `posthog.init`, replay configuration, or a UI
renderer that can display customer-controlled data:

1. **Allowlist eligible deployments.** Keep replay disabled by default and
   enable it only in explicitly approved hosted regions. A configured PostHog
   key is not proof that a deployment is eligible. In Langfuse, replay remains
   disabled when the cloud region is absent, and the HIPAA region initializes no
   PostHog client at all; cover an eligible region, HIPAA, and no cloud region
   in config tests.
2. **Classify by data provenance, not HTML element.** Customer-controlled data
   includes trace/observation payloads, dataset items, prompts, generated
   output, evaluator/code input, identifiers, comments, names, tags, metadata,
   schemas, provider options, media previews/URLs, and values copied into
   `title`, `aria-*`, or other attributes. Ordinary rendered text can be as
   sensitive as an `<input>` value.
3. **Protect the shared render boundary.** Prefer `ph-no-capture` on the
   smallest shared component or renderer that owns a sensitive value. Block
   the complete subtree so text, attributes, nested media, and later view-mode
   changes inherit the protection. Keep native input masking and a
   `contenteditable` selector as backstops, not the primary policy.
4. **Follow actual DOM topology.** Audit read-only, edit, history, diff,
   loading, empty, virtualized, hover, and dialog variants. Portaled content is
   outside a blocked trigger's subtree and needs its own protection. Custom
   editors and syntax highlighters are not covered merely because they behave
   like inputs.
5. **Redact non-DOM channels.** Never record request/response bodies, console
   payloads, or custom replay events containing customer content. Keep network
   body redaction even when the visible DOM is blocked.
6. **Prove the emitted replay, not only the JSX.** Add config contract tests
   for deployment gating and focused component tests for blocking boundaries.
   For meaningful masking changes, run the installed recorder in a browser
   with unique sentinels in ordinary text, native inputs, custom editors,
   blocked subtrees, attributes, and portals; inspect emitted replay events and
   prove sensitive sentinels are absent while intended UI text remains.

Before implementation, write a one-paragraph data-boundary plan: what remains
visible, what must never leave the browser, which deployment classes are
eligible, and which shared renderers enforce it. If that boundary includes
customer-controlled content, get an explicit product/legal decision rather
than inferring consent from existing analytics. Also run the
[`security-review`](../security-review/SKILL.md) skill and its
[`client-telemetry-privacy.md`](../security-review/references/client-telemetry-privacy.md)
checklist.

## Workflow

1. **Tracking plan first (tiny).** Write the question(s) → the events + props
   that answer them → the key dimension. A short table beats scattered
   `capture()` calls. (This IS the PR description.)
2. **Register** the events in the `events` object (typed).
3. **Wire** `capture()` at the intent seams (Rule 2), with dedup (3), the
   dimension (4), full coverage (5), metadata-only (1).
4. **Verify live** (6) — once + dimension + privacy.
5. **PR** with the taxonomy table + an explicit "metadata-only, no raw values"
   note. Fix any pre-existing leaks you pass.

For replay-only changes, use the session-replay data-boundary plan and recorder
probe above instead of inventing an analytics event or taxonomy entry.

## Anti-patterns

- Raw values / PII in props (Rule 1).
- Wrong-seam double-count (Rule 2).
- A dimension that silently defaults to `"unknown"` (Rule 4).
- Coverage gaps (Rule 5).
- Event bloat / events that map to no question.
- Inconsistent naming — stick to `resource:action` snake_case; do not drift to
  spaces or rename existing events.
- Raw `posthog.capture` in a component instead of the typed hook.
- Trusting a typecheck as verification (Rule 6).
- Assuming `maskAllInputs` covers rendered text, custom editors, attributes,
  or portals.
- Enabling replay wherever PostHog credentials happen to be configured.

## References

- [references/posthog-best-practices.md](references/posthog-best-practices.md)
  — PostHog's official doctrine (naming, taxonomy, property scopes, PII,
  tracking-plan governance), cited to their docs. Read when designing a new
  taxonomy or debating naming/scope.
- [references/posthog-code-patterns.md](references/posthog-code-patterns.md)
  — how PostHog instruments its OWN frontend (central registry module,
  sanitize-at-call-site PII firewall, super properties + groups, FE-vs-server
  naming), cited to their product code. Read when hardening the pattern or
  adding global dimensions.
- **Worked example:** LFE-10781 / PR #14929 — a filter/search-bar taxonomy,
  the `isV4` dimension, and three review fixes (unforwarded dimension,
  coverage gap, stale-ref misfire) are the canonical case study.
