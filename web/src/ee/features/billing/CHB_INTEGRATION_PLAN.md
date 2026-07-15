# ClickHouse Billing (CHB) Integration — Implementation Plan

Status: draft for review · Owner: Steffen Schmitz · Last updated: 2026-07-15

## 1. Context and goal

Langfuse Cloud billing today talks directly to Stripe (checkout, subscriptions,
schedules, meters, invoices, portal). Per the "Langfuse Billing Integration"
Linear project, billing moves behind **ClickHouse Billing (CHB)**: CHB owns
M3ter (what to charge) and Stripe (how money is collected), and Langfuse
integrates only with CHB via a REST API and signed webhooks.

Source specs:

- [BIL-5791 — Billing Integration: Langfuse → ClickHouse Billing](https://linear.app/clickhouse/issue/BIL-5791)
  (master spec: REST contract, webhook contract, data model, flows)
- [BIL-5794 — metrics-api spec + project events](https://linear.app/clickhouse/issue/BIL-5794)
  (Langfuse-built metrics endpoint, `LANGFUSE_PROJECT_CREATED/DELETED` events)
- Supporting: BIL-5880/5890–5898 (CHB REST endpoints), BIL-5885/5899–5906
  (webhook emitters), BIL-5910 (409 on mutations without active payment),
  BIL-5957 (CHB consumes project events — done).

**Goal of this iteration:** every **new customer** whose organization is
created on or after a configurable cutoff date uses the CHB flow. Every
existing customer keeps the current Stripe flow, byte-for-byte unchanged.

**Non-goals (explicitly out of scope here):**

- Migration of existing Stripe-billed customers to CHB (separate project;
  BIL-6021–6029).
- Marketplace customers.
- Removing the Stripe code path, `STRIPE_SECRET_KEY`, or the Stripe webhook.
- Promotion codes / discounts on the CHB path (no CHB API for it yet).

## 2. Current state (what the integration must preserve)

The relevant seams in this repo, verified 2026-07-15:

| Concern | Where it lives today |
| --- | --- |
| Outbound Stripe calls | `web/src/ee/features/billing/server/stripeBillingService.ts` — single `BillingService` class; factory `createBillingServiceFromContext` |
| tRPC surface | `web/src/ee/features/billing/server/cloudBillingRouter.ts` — 10 procedures (`getSubscriptionInfo`, `createStripeCheckoutSession`, `changeStripeSubscriptionProduct`, `cancelStripeSubscription`, `reactivateStripeSubscription`, `clearPlanSwitchSchedule`, `getStripeCustomerPortalUrl`, `getInvoices`, `getUsage`, `applyPromotionCode`) |
| Inbound Stripe webhook | `web/src/app/api/billing/stripe-webhook/route.ts` → `stripeWebhookHandler.ts`; handles `customer.subscription.{created,updated,deleted}`; **single writer** of `cloudConfig.stripe` |
| Billing state | `Organization.cloudConfig` JSONB (`packages/shared/src/interfaces/cloudConfigSchema.ts`): `plan` (manual override), `stripe.{customerId, activeSubscriptionId, activeProductId, activeUsageProductId, subscriptionStatus}` |
| Plan resolution | `web/src/features/entitlements/server/getPlan.ts` — `cloudConfig.plan` override → `mapStripeProductIdToPlan(stripe.activeProductId)` → `cloud:hobby` |
| Plan catalogue | `web/src/ee/features/billing/utils/stripeCatalogue.ts` (`cloud:core/pro/team/enterprise` + metered usage product) |
| Cycle anchor / usage cache | `Organization.cloudBillingCycleAnchor`, `cloudCurrentCycleUsage`, `cloudFreeTierUsageThresholdState` (prisma) |
| Free-tier enforcement | `worker/src/ee/usageThresholds/**` — paid gate is `cloudConfig.stripe.activeSubscriptionId || cloudConfig.plan`; `BLOCKED` state suspends ingestion via the cached API-key record (`apiAuth.ts`) |
| Usage metering | `worker/src/ee/cloudUsageMetering/handleCloudUsageMeteringJob.ts` — hourly, selects orgs by `cloudConfig.stripe.customerId`, pushes `tracing_events`/`tracing_observations` Stripe meter events |
| Spend alerts | `worker/src/ee/cloudSpendAlerts/**` — per-org job fed by the metering job, spend from Stripe invoice preview; `CloudSpendAlert` prisma model |
| Meter backup | `worker/src/ee/meteringDataPostgresExport/**` → `BillingMeterBackup` table (Stripe meter reverse-sync) |
| Org deletion | `organizationRouter.ts` calls `BillingService.cancelImmediatelyAndInvoice` before delete |
| Cache invalidation | `invalidateCachedOrgApiKeys` (packages/shared) — **must** be called whenever resolved plan or block state changes, because plan + `isIngestionSuspended` are baked into the Redis-cached API-key record |

Two properties make the two-provider split tractable:

1. **`cloudConfig.stripe` is the only provider-specific state** in the
   resolved-plan path, and the Stripe webhook is its only writer.
2. All downstream logic (entitlements, rate limits, ingestion suspension, UI
   gating) keys off the **resolved `Plan`** (`cloud:hobby|core|pro|team|enterprise`),
   not off Stripe objects.

## 3. Design overview

### 3.1 Provider routing — one function, decided per org

Add a single shared resolver (new file
`packages/shared/src/interfaces/billingProvider.ts`, exported next to
`parseDbOrg`), used by web **and** worker:

```ts
type BillingProvider = "stripe" | "clickhouse";

function getBillingProvider(org: ParsedOrganization): BillingProvider {
  // 1. Explicit CHB state always wins (org already on CHB).
  if (org.cloudConfig?.clickhouse?.organizationId) return "clickhouse";
  // 2. Any existing Stripe billing state pins the org to Stripe (legacy).
  if (
    org.cloudConfig?.stripe?.customerId ||
    org.cloudConfig?.stripe?.activeSubscriptionId
  )
    return "stripe";
  // 3. Otherwise the cutoff decides: new orgs → CHB.
  const cutoff = env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE; // ISO date | undefined
  if (cutoff && org.createdAt >= new Date(cutoff)) return "clickhouse";
  return "stripe";
}
```

Properties:

- **Unset cutoff ⇒ zero behavior change.** No org resolves to `clickhouse`
  unless it already carries a `clickhouse` block, which nothing writes until
  the feature is live. This is the kill switch for enabling; see §7 for the
  post-enable kill-switch story.
- The date check only ever applies to orgs with **no Stripe billing state** —
  an existing billed customer can never flip providers via config.
- The decision becomes **sticky** the moment CHB state is written (first
  checkout stores `clickhouse.organizationId`), so later changes to the cutoff
  env cannot strand an org mid-flow.
- Pre-cutoff **hobby** orgs (no Stripe state) stay on the Stripe path and can
  still check out via Stripe. This matches the "new customer = signs up after
  X" requirement. Decision knob: we could instead route *any first-ever
  checkout* after the cutoff to CHB (shrinks the future migration set, no
  backward-compat risk since these orgs have no billing state). Recommended
  follow-up once CHB is proven; not in this iteration.

Interlocks (defense in depth, mirroring the existing manual-`plan`-override
interlock in `createCheckoutSession`/`changePlan`):

- CHB checkout throws if the org has any `cloudConfig.stripe` subscription
  state or a manual `cloudConfig.plan` override.
- Stripe checkout throws if the org has a `cloudConfig.clickhouse` block.
- The CHB webhook handler refuses to write to an org whose provider resolves
  to `stripe`.

### 3.2 Data model — `cloudConfig.clickhouse`

Extend `CloudConfigSchema` (`packages/shared/src/interfaces/cloudConfigSchema.ts`)
with a sibling block, written **only** by the CHB webhook handler plus one
field (`organizationId`) written by checkout-session creation:

```ts
clickhouse: z
  .object({
    organizationId: z.string().nullish(), // ClickHouse Organization ID
    bundleId: z.string().nullish(),
    planCode: z.string().nullish(),       // "core" | "pro" | "team" | "enterprise"
    paymentStatus: z.string().nullish(),  // "active" | "failed" | ... (kept loose like stripe.subscriptionStatus)
    nextPaymentDate: z.string().nullish(),
    // Snapshot of a pending scheduled change (downgrade/cancel) for the UI.
    scheduled: z
      .object({
        type: z.string(),                 // "upgrade" | "downgrade" | "cancel"
        when: z.string(),                 // "immediate" | "billing_cycle_end" | ISO date
        planCode: z.string().nullish(),
        startDate: z.string().nullish(),
      })
      .nullish(),
    // Monotonic guard against out-of-order webhook delivery.
    lastEventCreatedAt: z.string().nullish(),
  })
  .nullish(),
```

Deliberate deviation from BIL-5791 §3.1: the spec sketches mirroring the CHB
Stripe `customerId` into the legacy `stripe` block ("new orgs: only
customerId") and mapping `bundleStatus → stripe.subscriptionStatus`. We do
**not** do that. Keeping the `stripe` block empty for CHB orgs preserves the
invariant *"presence of Stripe state ⇔ Stripe-billed org"*, which is what
makes provider routing and the worker-job exclusions (§3.7) fall out for free.
The spec explicitly allows this ("Langfuse is entitled to model this the way
it fits better"). If we ever need the underlying Stripe customer id (e.g. for
support tooling), it goes in `clickhouse.stripeCustomerId`.

No Prisma schema change is needed: `cloudBillingCycleAnchor`,
`cloudCurrentCycleUsage`, `cloudFreeTierUsageThresholdState`, and
`CloudSpendAlert` are provider-agnostic and are reused as-is.

### 3.3 Plan resolution and entitlements

`getPlan.ts` gains one branch (order: manual override → clickhouse → stripe →
hobby):

```ts
if (cloudConfig?.plan) { /* unchanged manual override */ }
if (cloudConfig?.clickhouse?.planCode)
  return mapChbPlanCodeToPlan(cloudConfig.clickhouse.planCode); // core → cloud:core, ...
if (cloudConfig?.stripe?.activeProductId) { /* unchanged */ }
return "cloud:hobby";
```

`mapChbPlanCodeToPlan` lives in a new thin catalogue
`web/src/ee/features/billing/utils/chbCatalogue.ts` (twin of
`stripeCatalogue.ts`): CHB `PlanCode` (`core|pro|team|enterprise`) ↔ Langfuse
`Plan` (`cloud:*`) ↔ UI metadata (title, price copy, order key for
upgrade/downgrade classification). Unknown plan codes resolve to `cloud:hobby`
with an error log (fail-open to the free tier, never to a paid tier).

Because CHB plan codes map onto the **same** `Plan` enum, the entire
entitlement matrix, rate limits, and UI gating work unchanged. On
`bundle.cancelled` the handler clears `planCode`, so the org resolves back to
`cloud:hobby` — same semantics as Stripe's `subscription.deleted` today.

### 3.4 Outbound: CHB API client + service

New directory `web/src/ee/features/billing/server/chb/`:

- **`chbApiClient.ts`** — thin fetch wrapper for the CHB REST API
  (BIL-5791 §2.1). `Authorization: Bearer ${CLICKHOUSE_BILLING_SERVICE_TOKEN}`,
  `CH-Organization-Id` header, zod-parsed responses, typed error for
  `409 Conflict` (payment method missing → client falls back to checkout,
  BIL-5910). Endpoints:
  - `POST /checkout-sessions` `{organizationId?, email, planCode, returnUrl, idempotencyKey}`
  - `PUT /bundles/{id}/scheduled` (upgrade / downgrade / cancel; 202)
  - `DELETE /bundles/{id}/scheduled` (reactivate / clear scheduled change; 202)
  - `GET /bundles/{id}?fields=plan,period,payment,scheduled`
  - `GET /invoices?bundleId={id}`
  - `POST /portal-sessions`
  - Idempotency keys reuse the existing `makeIdempotencyKey`/`IdempotencyKind`
    machinery (`utils/stripeIdempotencyKey.ts`, kinds extended), keyed on the
    client-generated `opId` the router already accepts — satisfying the
    "created and kept by Langfuse" requirement from the spec without new
    storage.
  - The spec says CHB will publish a generated typed client. Until it exists,
    this module is the only place that knows the wire format, so swapping it
    for the generated client later is a one-file change.
- **`chbBillingService.ts`** — `class ChbBillingService` exposing the *same
  router-facing surface* as the Stripe `BillingService` (same method names and
  return shapes, incl. `BillingSubscriptionInfo`), implemented against the
  client:
  - `getSubscriptionInfo` ← `GET /bundles/{id}` (maps `scheduled` →
    `scheduledChange`/`cancellation`, `payment.status` → `hasValidPaymentMethod`).
  - `createCheckoutSession` ← `POST /checkout-sessions`; on response,
    persists `cloudConfig.clickhouse.organizationId` (the only non-webhook
    write; enables checkout recovery on retry per spec §5) and returns the
    hosted URL.
  - `changePlan` ← `PUT /bundles/{id}/scheduled` with
    `{type: upgrade|downgrade, when: immediate|billing_cycle_end, planCode}`;
    upgrade/downgrade classification via `chbCatalogue` order keys; a `409`
    is translated into the same "needs checkout" UX path the dialog already
    handles for new subscriptions.
  - `cancel` / `reactivate` / `clearPlanSwitchSchedule` ← `PUT|DELETE /bundles/{id}/scheduled`.
  - `cancelImmediatelyAndInvoice` ← `PUT /bundles/{id}/scheduled`
    `{type: "cancel", when: "immediate"}` (spec: closes bill + invoices on
    cancellation date; touches billing data only). No-op when the org has no
    `bundleId` — mirrors the Stripe no-op for hobby orgs so org deletion keeps
    working.
  - `getInvoices` ← `GET /invoices?bundleId=` mapped into the existing invoice
    table row shape (open question §8 on field parity: hosted download URL,
    draft/upcoming row).
  - `getUsage` — v1 uses the **existing non-Stripe fallback** (billing cycle
    from `cloudBillingCycleAnchor` + cached `cloudCurrentCycleUsage`), which
    the Stripe path already uses for hobby orgs. Spend-in-USD for the period
    can later come from `GET /bundles/{id}?fields=period`.
  - `applyPromotionCode` — throws `NOT_IMPLEMENTED` (button hidden for CHB
    orgs, §3.8).
- **Dispatch** — `createBillingServiceFromContext(ctx, org)` becomes
  `resolveBillingService(...)`: it resolves the provider via
  `getBillingProvider(org)` and returns either the untouched Stripe
  `BillingService` or `ChbBillingService`. The ten `cloudBillingRouter`
  procedures keep their names, inputs, and output shapes — **the tRPC contract
  does not change**, so the entire billing UI keeps working against either
  provider.
  - Transitional wart, contained in one place: the two plan-selection
    mutations take `stripeProductId`. For CHB orgs, `ChbBillingService` maps
    `stripeProductId → Plan → PlanCode` via the two catalogues. Follow-up
    (post-GA) to introduce plan-code-first inputs and retire the product-id
    input.

### 3.5 Inbound: CHB webhook

New route `web/src/app/api/billing/clickhouse-webhook/route.ts` → handler
`web/src/ee/features/billing/server/chb/chbWebhookHandler.ts` (structural twin
of `stripeWebhookHandler.ts`):

1. **Verify**: HMAC-SHA256 over `timestamp + "." + rawBody` with
   `CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET`; `timingSafeEqual` compare;
   reject on clock skew > 5 min. Exact header/format is pending CHB's security
   review (BIL-5791 open thread) — isolated in a single `verifyChbSignature`
   function so the final scheme is a one-function change.
2. **Dedupe**: `SET NX` on `chb-webhook-event:{eventId}` in Redis with 24 h
   TTL; duplicates return 200 without processing. Redis is best-effort — every
   handler below is also idempotent (pure upserts guarded by
   `lastEventCreatedAt`), so a Redis flush cannot corrupt state.
3. **Region fan-out** (confirmed in BIL-5791 comments: CHB pings all Langfuse
   regions): resolve the org by JSONB lookup
   `cloudConfig->'clickhouse'->>'organizationId' = event.organizationId`. Not
   found ⇒ another region owns it ⇒ **200 OK, ignore**. Found but provider
   resolves to `stripe` ⇒ 200 + error log (interlock; must never happen).
4. **Ordering guard**: drop events whose `createdAt` ≤ stored
   `lastEventCreatedAt` (protects against retries and out-of-order delivery).
5. **Handle** (per BIL-5791 §2.2 effect table), all inside one code path that
   ends with `invalidateCachedOrgApiKeys(orgId)` + `auditLog`:

| Event | Effect on org |
| --- | --- |
| `bundle.created` | Write `clickhouse.{bundleId, planCode, paymentStatus, nextPaymentDate}`; set `cloudBillingCycleAnchor` from `data.startDate`; clear `cloudFreeTierUsageThresholdState` (un-suspend); seed default spend alerts (reuse `createDefaultSpendAlerts`, refactored to take a `Plan` instead of a Stripe product — additive overload, Stripe call sites unchanged); **backfill-emit `LANGFUSE_PROJECT_CREATED` for all existing projects of the org** (§3.6 — projects created pre-checkout would otherwise be invisible to CHB metering) |
| `bundle.updated` | Update `planCode`/`paymentStatus`/`nextPaymentDate`/`scheduled`; clear threshold state when payment becomes `active` (mirror of Stripe `active|trialing` logic) |
| `bundle.scheduled` | Persist `clickhouse.scheduled` snapshot only — no plan change (UI renders the pending-change banner from it) |
| `bundle.cancelled` | Clear `planCode`/`bundleId`/`scheduled` (keep `organizationId` — spec: customer + CH org survive); reset `cloudBillingCycleAnchor` to start of today (same as Stripe `subscription.deleted`) |

Note the unresolved spec thread: whether a *second* webhook fires when a
scheduled cancel actually executes. The handler is written to be correct
either way — if only `bundle.scheduled` arrives, the org keeps its paid plan
until a `bundle.updated`/`bundle.cancelled` lands; we do **not** locally
execute scheduled changes on a timer.

### 3.6 Langfuse → CHB: metrics API + project lifecycle events (BIL-5794)

These are required by CHB's metering pipeline (LF BMP milestone) regardless of
the cutoff and are additive/read-only, so they ship first.

**Metrics API** — new route `web/src/app/api/billing/metrics/route.ts`:

- `GET /api/billing/metrics?startTime=...&endTime=...&resourceId={projectId}`
- Auth: `Authorization: Bearer ${CLICKHOUSE_BILLING_METRICS_API_KEY}`,
  `timingSafeEqual` compare against a dedicated env secret. The existing
  `ADMIN_API_KEY` mechanism is deliberately not reused — it is hard-blocked on
  Cloud, which is exactly where this endpoint must run.
- Implementation reuses the existing per-project interval counters the hourly
  metering job already uses (`getTraceCountsByProjectInCreationInterval`,
  `getObservationCountsByProjectInCreationInterval`,
  `getScoreCountsByProjectInCreationInterval` in
  `packages/shared/src/server/repositories/`), filtered to the requested
  project. Response shape exactly per BIL-5794
  (`metrics: { traces: {sum}, scores: {sum}, observations: {sum} }`).
- Guardrails: reject windows > 35 days; validate ISO timestamps; 404 unknown
  project. Perf note: unbounded `created_at` scans on `observations` have hit
  the 125 s ClickHouse ceiling in prod before — CHB's poller uses short
  (hourly/daily) windows, and the window cap keeps ad-hoc calls from
  triggering full scans; if wide-window calls become a requirement, add a
  minmax index on `created_at` first.

**Project lifecycle events** — new queue + processor (do **not** reuse the
per-project automation `WebhookQueue`; that system routes to user-configured
destinations):

- `QueueName.CloudBillingProjectEventQueue` + payload schema in
  `packages/shared/src/server/queues.ts` (payload:
  `{eventType, projectId, orgId, createdAt}`); queue class in
  `packages/shared/src/server/redis/`; processor
  `worker/src/queues/cloudBillingProjectEventQueue.ts` POSTs
  `LANGFUSE_PROJECT_CREATED` / `LANGFUSE_PROJECT_DELETED` (exact BIL-5794
  payloads, `organizationId` = `cloudConfig.clickhouse.organizationId`,
  `regionId` = `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION`) to
  `CLICKHOUSE_BILLING_EVENT_BUS_URL` with the service token. BullMQ retries
  with exponential backoff; reuse the secure outbound fetch primitives
  (`packages/shared/src/server/outbound-url/`).
- Emit points:
  - created: `projectsRouter.create` and admin-API `handleCreateProject`,
    right after the DB write.
  - deleted: at **soft-delete** time (`projectsRouter.delete` and admin-API
    project delete) — that is when the customer stops being billable; the
    async hard-delete worker is not the billing-relevant moment.
  - Enqueue only when the org has `clickhouse.organizationId` (CHB has nothing
    to meter otherwise); the `bundle.created` backfill (§3.5) covers projects
    that predate checkout.

### 3.7 Worker changes

- **`cloudUsageMetering`**: no functional change needed — org selection
  requires `cloudConfig.stripe.customerId`, which CHB orgs never get (§3.2
  invariant). Add a defensive `getBillingProvider(org) === "stripe"` guard +
  metric in the per-org loop so a future invariant break surfaces as a
  skipped-org counter instead of double-metering (CHB meters these orgs by
  polling our metrics API).
- **`meteringDataPostgresExport`**: unchanged (same natural exclusion).
- **Free-tier thresholds** (`worker/src/ee/usageThresholds/thresholdProcessing.ts`):
  extend the paid gate to
  `stripe.activeSubscriptionId || cloudConfig.plan || clickhouse.bundleId`
  via a shared `hasPaidBillingState(org)` helper next to
  `getBillingProvider`. Without this, a paying CHB customer would be
  ingestion-blocked at 250 k events. Pure OR-extension: Stripe-org behavior
  identical.
- **`cloudSpendAlerts`**: the job computes spend from a Stripe invoice
  preview and is only triggered for orgs the metering job touches, so CHB
  orgs are naturally excluded in this iteration. Default alerts are still
  seeded on `bundle.created` so thresholds are in place; the CHB-side
  evaluation (spend from `GET /bundles/{id}?fields=period`, fan-out from a
  small scheduled job over CHB orgs) is **Phase 4** — before GA, since spend
  alerts are part of the paid-plan value proposition.

### 3.8 UI changes

The tRPC contract is unchanged (§3.4), so the billing page renders both
providers through the same components. Required deltas:

- `getSubscriptionInfo` response gains `billingProvider: "stripe" | "clickhouse"`;
  `useBillingInformation` exposes it.
- Hide for CHB orgs: `BillingDiscountCodeButton` (no promo API),
  `BillingDiscountView`. Everything else (switch-plan dialog, cancel/keep
  buttons, portal button, invoice table, usage chart, schedule notification,
  spend alerts section) works via the dispatched procedures.
- Checkout return/cancel URLs reuse the existing settings-page deep links
  (`returnUrl` parameter of `POST /checkout-sessions`).

### 3.9 Configuration

New env vars (all optional; web unless noted — declared in `web/src/env.mjs`,
worker vars in `worker/src/env.ts`, and added to every `.env.*.example`):

| Var | Purpose |
| --- | --- |
| `LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE` | ISO date; orgs created ≥ this date route to CHB. Unset = feature off |
| `CLICKHOUSE_BILLING_BASE_URL` | CHB REST base URL (web) |
| `CLICKHOUSE_BILLING_SERVICE_TOKEN` | Bearer token for CHB REST + event bus (web + worker) |
| `CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET` | HMAC secret for inbound CHB webhooks (web) |
| `CLICKHOUSE_BILLING_METRICS_API_KEY` | Bearer token CHB uses to call our metrics API (web) |
| `CLICKHOUSE_BILLING_EVENT_BUS_URL` | Event-bus endpoint for project events (worker) |

Sanity guard at boot: if the cutoff date is set but any of the CHB
URL/token/secret vars are missing, log an error and treat the cutoff as unset
(fail closed to Stripe/hobby, never half-configured CHB).

## 4. How backward compatibility is assured

Invariants, each enforced in code and covered by tests (§6):

1. **Existing billed customers are pinned to Stripe.** Any org with
   `cloudConfig.stripe.customerId` or `activeSubscriptionId` resolves to
   `stripe` in `getBillingProvider` *before* the date check is reached. There
   is no code path that flips a Stripe org to CHB (migration is a separate,
   explicit project).
2. **The Stripe implementation is not modified.** `stripeBillingService.ts`,
   `stripeWebhookHandler.ts`, `stripeCatalogue.ts`, and the Stripe webhook
   route are untouched except: (a) `createDefaultSpendAlerts` gets an
   additive plan-based overload, (b) the router swaps
   `createBillingServiceFromContext` for the provider-dispatching factory —
   which returns the identical Stripe service for Stripe orgs.
3. **Changes to shared logic are strictly additive OR-branches**: plan
   resolution (`clickhouse.planCode` branch inserted; Stripe branch and
   precedence of the manual override unchanged), threshold paid-gate
   (`|| clickhouse.bundleId`), metering loop (defensive skip only).
4. **CHB orgs never grow Stripe state; Stripe orgs never grow CHB state**
   (interlocks in both checkout paths + webhook writer refusal). The worker
   jobs' Stripe-customer-id selection therefore keeps excluding CHB orgs
   structurally, not by convention.
5. **Everything is dark until the cutoff env is set**, and the cutoff can be
   set to a future date to arm the flow in staging first. Post-enable
   rollback: clearing the cutoff stops *new* org routing; orgs already carrying
   CHB state keep working through the webhook/REST path (they must — they hold
   active bundles). See §7.
6. **The tRPC and UI contract is provider-agnostic**, so no client-side
   version skew: an old web client works against the dispatching router.
7. **Cache correctness**: every CHB webhook write ends in
   `invalidateCachedOrgApiKeys`, same as Stripe — plan/suspension changes
   propagate to API-key auth identically for both providers.

## 5. Implementation phases

Each phase is independently shippable and dark until the cutoff is set.

**Phase 0 — plumbing (shared):**
`cloudConfigSchema.ts` `clickhouse` block · `billingProvider.ts` resolver +
`hasPaidBillingState` · env vars (web/worker + `.env.*.example`) ·
`chbCatalogue.ts` · `getPlan.ts` branch · threshold paid-gate.
*Verification: `pnpm run lint`, `pnpm tc`, existing web + worker billing/threshold tests green.*

**Phase 1 — Langfuse-built surfaces for CHB (BIL-5794):**
metrics API route + auth · project-event queue/payload/processor · emit points
in `projectsRouter` + admin API. Coordinates with CHB's LF BMP tickets
(BIL-5786–5790); they can UAT against staging as soon as this lands.

**Phase 2 — CHB client + inbound webhook:**
`chbApiClient.ts` · `chbBillingService.ts` · webhook route + handler (HMAC,
dedupe, ordering, region fan-out, four event handlers, spend-alert seeding,
project backfill emit).

**Phase 3 — dispatch + UI:**
provider-dispatching service factory in `cloudBillingRouter` ·
`billingProvider` in `getSubscriptionInfo` · hide promo/discount UI for CHB
orgs · org-deletion path dispatches `cancelImmediatelyAndInvoice`.

**Phase 4 — CHB spend alerts** (pre-GA): scheduled evaluation of
`CloudSpendAlert` rows for CHB orgs against bundle period spend.

**Phase 5 — rollout:** see §7.

## 6. Testing & verification

- **Unit**: `getBillingProvider` matrix (stripe state / clickhouse state /
  cutoff set-unset × org age / both-state conflict) · CHB plan-code mapping
  incl. unknown codes · HMAC verify (valid, bad sig, skew) · webhook ordering
  + dedupe · each event handler's cloudConfig writes.
- **Server integration** (`pnpm --filter web run test`): webhook route
  end-to-end with signed fixtures (region-miss → 200-ignore; created →
  anchor + spend alerts + cache invalidation) · metrics API (auth failure,
  window validation, counts against seeded CH data) · router dispatch: same
  procedure hits Stripe service for a legacy-config org and CHB service for a
  cutoff org. Note: server tests run in dual write mode via root `.env` —
  metrics-API count tests must seed via the standard ingestion path, not raw
  CH inserts.
- **Worker** (`pnpm --filter worker run test`): threshold paid-gate for a CHB
  org (not blocked at 250 k) · metering job skips CHB orgs · project-event
  processor POST + retry behavior (mock event bus).
- **Regression**: full existing billing test suites must pass **unmodified** —
  that is the executable form of invariant §4.2.
- **Manual/browser** (per repo policy for `web/**` flows): seed a local org,
  set cutoff in the past, walk checkout → webhook fixture → billing page
  render; and a legacy-config org to confirm the Stripe UI is pixel-identical.
- **E2E against CHB staging** = UAT tickets BIL-6031 (new customer → PAID) and
  BIL-6032 (upgrade/downgrade), plus webhook replay for each `bundle.*` type.

## 7. Rollout & kill switch

1. Deploy Phases 0–3 dark (no env set) → prod. Nothing changes.
2. Staging: set all CHB env vars + cutoff in the past; run UAT (BIL-6031/6032).
3. Prod: set env vars with **cutoff = agreed future date X**, announce
   internally; verify webhook connectivity with CHB before X.
4. From X: new orgs route to CHB (BIL-6034 tracks the CHB-side toggle).
5. Kill switch semantics: unsetting the cutoff reverts **routing of
   not-yet-committed orgs** to Stripe instantly. Orgs that already hold CHB
   state continue on CHB (they have live bundles; flipping them is a
   migration, not a rollback). A hard emergency stop is: unset cutoff +
   CHB pauses webhook emission; affected orgs freeze at their last-known plan
   state, which is safe (plan resolution is local).

## 8. Open questions (tracked against Linear before/while building)

1. **Scheduled-cancel terminal event** — does a `bundle.updated`/`cancelled`
   fire when a scheduled change executes? (BIL-5791 thread, unresolved.)
   Handler is order-tolerant either way, but plan display copy depends on it.
2. **HMAC scheme final form** — pending CHB security review; isolated in
   `verifyChbSignature`.
3. **Invoice payload parity** — hosted-invoice/download URL and
   draft/upcoming-invoice representation in `GET /invoices` (thread: both
   needed); determines how much of `BillingInvoiceTable` renders for CHB orgs.
4. **`nextPaymentDate`/`nextInvoiceDate`** on `GET /bundles/{id}` — requested
   in review, not yet in the spec's response shape.
5. **Checkout email** — `POST /checkout-sessions` requires `email`; use the
   acting user's email (matches "billing contact" semantics on the CH org?
   validate with CHB).
6. **Usage display source of truth** — v1 uses local
   `cloudCurrentCycleUsage`; decide whether the billing page should switch to
   CHB bundle-period usage once available (hourly-export lag per spec).
7. **Pre-cutoff hobby orgs** — remain Stripe-routed here; decide whether
   first-checkout-after-X should route to CHB instead (§3.1 knob) to shrink
   the migration set.
