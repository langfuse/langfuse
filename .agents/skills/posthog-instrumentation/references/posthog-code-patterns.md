# How PostHog instruments its OWN frontend (from their product code)

Real code patterns from the PostHog product monorepo (`PostHog/posthog`, React + Kea,
`frontend/src/`). Complements the docs (`posthog-best-practices.md`). Where PostHog's _practice_ beats
its _docs_, the practice wins.

## 1. ONE module owns every event — `eventUsageLogic`

`frontend/src/lib/utils/eventUsageLogic.ts` — a single Kea logic with **267 `posthog.capture(` calls**
(the next-densest file has 17). Two-part shape: `actions({ reportX: (…) => payload })` **types every
event**; `listeners({ reportX })` is the _only_ place that calls `posthog.capture(name, props)`. A
component calls `reportInsightViewed(...)` — it **never names the event string or touches `posthog`**.
~165 consumers via `useActions(eventUsageLogic)`. A few domain satellites follow the same shape
(onboarding/session-recording event logics). → **Langfuse's typed `usePostHogClientCapture` registry is
the same instinct.** The borrow is _discipline_: every event string + property shape in ONE reviewable
module; forbid raw `posthog.capture` at component call sites (a lint rule is a candidate hardening) so
nothing leaks the pattern.

## 2. PII firewall = metadata-only payloads + `sanitize*` helpers AT THE CALL SITE — NOT SDK denylists

**Key correction to the docs' framing:** PostHog carries **ZERO** `property_denylist` /
`sanitize_properties` / `mask_all_text` in its SDK init (`frontend/src/loadPostHogJS.tsx`). Raw content
never becomes a property because the **action payload only accepts metadata**. Examples from
`eventUsageLogic.ts`:

- `sanitizeQuery` — "returns properties that don't contain sensitive data": emits `query_kind`,
  `series_length`, `event_entity_count`, `has_properties` (bool), `display` — never the filter values.
- `sanitizeInsight` strips `result` before send.
- `reportPersonDetailViewed` → `properties_count`, `has_email` (bool), `has_name` (bool) — a rich
  profile with **no property value**.
- `name_length`/`tags_count`/`searchLength`/`resultsCount` everywhere — counts/lengths, never content.
- `objectClean(...)` drops undefined before send.

→ **For Langfuse:** encode "counts/lengths/booleans/enums only" into the typed registry's **parameter
types** so passing raw content is a **type error**; add shared `sanitize*(query|filter|…)` helpers for
complex objects. This is stronger than a runtime denylist. (Keep `before_send` only for _last-mile
secrets_ — §6.)

## 3. Naming — Langfuse's `resource:action` snake_case is BETTER; keep it

Empirically PostHog is **inconsistent**: of 781 distinct event names, ~80% are space-separated lowercase
(`"insight viewed"`, `"viewed dashboard"`), ~19% snake_case (newer areas: `ai_query_prompted`,
`error_tracking_issues_sorted`), **0 use a colon scheme.** The one thing they get right is
**resource-first ordering** (grouping by leading word). Names can't be renamed → they froze
`'viewed dashboard'` for back-compat. → **Langfuse's `resource:action` snake_case delivers
resource-grouping explicitly and machine-parseably. Don't drift to spaces. Version instead of rename
(`…_v2`).**

## 4. Global dimensions once via super properties + GROUPS (not per-event)

Stamped at login/preflight, not on every capture:

- `frontend/src/scenes/userLogic.ts`: `posthog.register({ is_demo_project })` (super prop) +
  `posthog.group('project', uuid, {...})` + `posthog.group('organization', id, {...})` +
  `posthog.group('customer', …)`; person props via `posthog.people.set({ email: anonymize?null:email,
realm })`.
- `frontend/src/scenes/PreflightCheck/preflightLogic.tsx`: `posthog.register({ realm, commit_sha, … })`
  — **`commit_sha` on every event.**
- `frontend/src/scenes/billing/billingLogic.tsx`: dynamic per-product usage super-props.
- `frontend/src/taxonomy/taxonomy.tsx` `CLOUD_INTERNAL_POSTHOG_PROPERTY_KEYS` — a catalog of the
  internal dimensions.

→ **For Langfuse (multi-tenant org→project):** group analytics
(`posthog.group('organization'|'project', …)`) + `register` version/edition/`v4BetaEnabled` **once** is
the scalable shape, instead of repeating global dims per event. Keep a catalog. NOTE: `isV4`/fast-mode
is _per-action surface state_ → it stays a **per-event** prop (the user-global v4-beta flag can also be
a super prop, but the per-event value reflects the surface at the action).

## 5. Distinct names prevent double-counting; split FE vs server by context

From `products/notebooks/plan/notebooks_observability_gaps.md` (an internal instrumentation-design
review — the closest thing PostHog has to a playbook): server-side capture at the creation **choke
point** = source of truth for counts; **distinct event names structurally prevent double-counting**
("rename the frontend capture to `notebook created (client)`"); keep the FE event for context the
server can't see (`$session_id` replay linkage, `$current_url` surface attribution, flag enrollment,
funnel continuity); a stable id (`short_id`) as idempotency key. → Langfuse already keeps server events
(`ServerPosthog`: `cloud_signup_complete`, playground analytics, telemetry) on distinct names — never
reuse an event name across FE and server.

## 6. `before_send` + replay opt-out for last-mile secrets; kill tracking on embedded/shared views

`frontend/src/loadPostHogJS.tsx` exposes a `before_send` hook; `frontend/src/exporter/index.tsx` sets
`apiKey=undefined` on shared/embedded dashboards (**don't log customers' end-users**) and, on the public
interview page, a `before_send` strips a secret token from `$current_url`/`$referrer` + a
`maskCapturedNetworkRequestFn` scrubs it from replay. Replay opt-out via
`session_recording.blockSelector: '.ph-replay-block'`; staff impersonation →
`opt_out_capturing_by_default`. → **For Langfuse:** `before_send` is for _secrets that shouldn't be
captured even in principle_ (tokens in URLs/share links) + disabling capture on publicly-embeddable
views (e.g. public traces) — NOT the primary PII mechanism (that's §2).

## 7. Ergonomic seam

Component → `const { reportX } = useActions(eventUsageLogic)` → call `reportX(...)` in the handler.
**No `posthog-js/react` `usePostHog()` hook is used in their app** (raw `posthog-js` singleton wrapped
in Kea). Direct `posthog.capture` in a `.tsx` exists only for lib-level infra widgets (Spinner,
toolbar). → Langfuse's `usePostHogClientCapture()` hook is the equivalent seam (Langfuse isn't Kea) —
the rule is the same: **the component calls a typed verb; it never names the event or touches
`posthog`.**

## 8. Notable: PostHog has NO dedicated "how to add events" doc

Guidance is scattered (`.cursor/rules/react-typescript.mdc` forces the Kea-first "events are data"
pattern; their `AGENTS.md` has a naming casing rule + a Celery capture gotcha). → **A dedicated Langfuse
instrumentation skill is MORE disciplined than PostHog's own setup** — a genuine improvement, not just a
copy.

## Cite (repo-relative in `PostHog/posthog`)

`frontend/src/lib/utils/eventUsageLogic.ts` · `frontend/src/loadPostHogJS.tsx` ·
`frontend/src/exporter/index.tsx` ·
`frontend/src/scenes/{userLogic.ts,PreflightCheck/preflightLogic.tsx,billing/billingLogic.tsx}` ·
`frontend/src/taxonomy/taxonomy.tsx` · `.cursor/rules/react-typescript.mdc` ·
`products/notebooks/plan/notebooks_observability_gaps.md`.
