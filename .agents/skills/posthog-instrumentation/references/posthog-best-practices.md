# PostHog's own instrumentation best practices (from their docs)

Synthesized from PostHog's published docs (repo `PostHog/posthog.com`; repo-relative paths below map to
`posthog.com/docs/…` URLs). Richest source: `contents/docs/product-analytics/best-practices.mdx`.
These GROUND the rules in `../SKILL.md`. **Where PostHog and the Langfuse house pattern differ, the SKILL
wins** (it is Langfuse-specific); everything below is the "why" plus the general doctrine.

## 1. Naming — `category:object_action`, lowercase, snake_case, present-tense verbs

`best-practices.mdx` §3: "use the **category:object_action** framework" → `signup_flow:pricing_page_view`;
"Only use lowercase letters"; "Use present-tense verbs (submit/create, not submitted/created)"; "Use snake
case"; keep a **fixed allow-list of verbs** (click/submit/create/view/add/invite/update/delete/remove/
start/end/cancel/fail/generate/send). Property names: **`object_adjective`** (`user_id`, `item_price`),
**`is_`/`has_`** for booleans, **`_date`/`_timestamp`** suffix for times.
→ **Langfuse's `resource:action` snake_case convention is this scheme.** Match the property-naming rules
too (camelCase variants: `isV4`, `hasFreeText`).
_(Caveat: PostHog's own docs are inconsistent — `getting-started/send-events.mdx` shows space-separated
`user signed up`; the snake_case best-practices scheme is the canonical one. Standardize on snake_case.)_

## 2. Static names only — no interpolation

`best-practices.mdx` §6: names must be **fixed strings, never generated dynamically** —
`page_viewed_${pageName}` explodes into thousands of undefilterable definitions (and can get property
definitions rate-limited). → **Langfuse's typed `events` registry enforces this by construction.**
Variable data goes in property _values_, never the name. §5: version instead of renaming
(`registration_v2:…`) — **event names cannot be changed after creation.**

## 3. Capture the critical path, not everything

`getting-hogpilled.mdx`: define a **North Star metric → metrics tree → funnel**, then "capture just enough
event data to measure the critical path… add more later." `best-practices.mdx` §1: instrument **growth
events first** (autocapture alone misses a reliable `user_signed_up`). → Anti-bloat: every event answers a
question (the SKILL's "one idea"). `activation.mdx`: activation events can be composite / a quantity.

## 4. Autocapture + explicit custom events

`getting-started/send-events.mdx`: start with autocapture for coverage, **add custom events for
high-value, stable actions** (sign-ups, purchases, feature use) — custom is "far more reliable" since
autocapture drifts when button text/DOM changes; tune autocapture if noisy. `autocapture.mdx`:
interaction/navigation/clipboard/heatmap/dead-click types + per-SDK support. → Langfuse instrumentation is
deliberately **custom events** (the actions are semantic, not DOM-stable).

## 5. Property scopes — event / person / super

`libraries/js/usage.mdx` (Super properties): `posthog.register(...)` sets props **auto-attached to every
subsequent `capture`** (NOT a person/group prop) — `register_once` for first-touch, `unregister` to
remove. This is **the documented "global dimension on every event" mechanism** → validates Langfuse's
`v4BetaEnabled` super property in `web/src/pages/_app.tsx`. `person-properties.mdx`: `$set`/`$set_once` on
the profile (cohorts/flags); 512KB/person; `$set` = last _ingested_ value (ordering caveat).
`send-events.mdx`: "always include more properties than you might need." Group properties = a 4th (B2B)
scope.

## 6. PII / privacy — layered, consent-first

`privacy/gdpr-compliance.mdx`: "don't collect, store or use any personal data without a good reason."
Layered controls: EU hosting → IP toggle → autocapture masking (only `name`/`id`/`class` on inputs; **no
form values**; skips password fields) → `ph-no-capture` class → **client-side `before_send` sanitization
(can `return null` to drop an event)** → before-storage transformations (hash PII, anonymize IP, drop
events) → opt-out. `libraries/js/config.mdx`: **`property_denylist`** = "properties that should never be
sent with `capture`"; `mask_all_text`; `before_send`. (`sanitize_properties` is not a separate option —
it is done via `before_send`.)
→ **Actionable for Langfuse:** beyond "reviewers must be careful," a **client-side backstop** is
available — a `property_denylist` for obviously-sensitive keys and/or a `before_send` that strips/asserts
no `value`/content field on filter/search events. That would have caught the `filter_builder_close`
raw-value leak at the SDK layer. Defense-in-depth, not a replacement for SKILL Rule 1 (and see
`posthog-code-patterns.md` §2 for why types-at-the-call-site is the primary mechanism).

## 7. Avoid double-counting + `distinct_id` hygiene

`send-events.mdx`: "use different event names for your backend and frontend events to avoid duplicate
counting" (`user created` backend vs `user signed up` frontend). `data/events.mdx`: dedup =
`uuid`+`event`+`timestamp`+`distinct_id`. `best-practices.mdx` §4: don't use catch-all `distinct_id`s
(`"system"`), keep casing consistent, link anon↔identified. §7-8: prefer backend for accuracy; events can
arrive out of order. → Langfuse's client double-count risk is the wrong-seam one (SKILL Rule 2); server
events already use distinct names (`cloud_signup_complete`) — keep it that way.

## 8. Plan + govern — tracking plan, schema management, event states

`getting-hogpilled.mdx` + `next-steps.mdx`: **write a tracking plan up front** (North Star → events).
`schema-management.mdx`: define events/typed property groups before capture, `posthog-cli exp schema pull`
generates typed clients, commit `posthog.json`; "Define events upfront", "Start with your most important
events". `data/events.mdx`: Data Management page — descriptions, tags, owners, **Verified / Hidden**
states (Hidden = soft-retire an old event). → Validates the SKILL's "tracking-plan-first" workflow; the
typed `events` registry is Langfuse's lightweight equivalent of schema management.

## Sources (repo-relative in `PostHog/posthog.com`; → posthog.com/docs/…)

`contents/docs/product-analytics/best-practices.mdx` · `contents/docs/new-to-posthog/getting-hogpilled.mdx`
· `contents/docs/getting-started/send-events.mdx` · `contents/docs/product-analytics/autocapture.mdx` ·
`contents/docs/libraries/js/usage.mdx` · `contents/docs/product-analytics/person-properties.mdx` ·
`contents/docs/privacy/{gdpr-compliance,data-collection,data-storage}.mdx` ·
`contents/docs/product-analytics/privacy.mdx` · `contents/docs/libraries/js/config.mdx` ·
`contents/docs/product-analytics/schema-management.mdx` · `contents/docs/data/events.mdx` ·
`contents/docs/new-to-posthog/activation.mdx`.
