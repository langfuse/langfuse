# Billing

## Overview

Stripe Billing powers subscriptions and usage-based pricing for organizations. We primarily use the new flexible billing model (plan + usage) and still handle legacy, single-item metered subscriptions during migration.

## Key Concepts

- **Organizations**: Entities within the product that can have multiple projects.
- **Projects**: Sub-entities under organizations where usage is tracked.
- **Observations**: Units of usage (API calls), tracked at project level and aggregated for billing per organization.

## Implementation Details

### API Surface (TRPC)

See `web/src/ee/features/billing/server/cloudBillingRouter.ts`.

- `getSubscriptionInfo` — live cancellation/scheduled-change info from Stripe.
- `createStripeCheckoutSession` — starts checkout for a product from the catalogue.
- `changeStripeSubscriptionProduct` — switches plan (upgrade now, downgrade at period end).
- `cancelStripeSubscription` / `reactivateStripeSubscription` — manage cancellation flags.
- `clearPlanSwitchSchedule` — releases any active/not-started schedule.
- `getStripeCustomerPortalUrl` — portal for payment methods, tax IDs, invoices (not for plan switches).
- `getInvoices` — paginated invoice list with subscription/usage/tax breakdown and preview row.

### Checkout and Subscription Management

Implemented in `web/src/ee/features/billing/server/stripeBillingService.ts`.

1. **Checkout**
   - Initiated from billing settings; only products from the catalogue are allowed.
   - For flexible billing, the session includes two items: plan (quantity 1) + usage.
   - `subscription_data.billing_mode` is set to flexible; metadata carries `orgId` and `cloudRegion`.

2. **Plan Changes**
   - Upgrades: immediate price swap with proration invoiced now; release any schedules first.
   - Downgrades: create a subscription schedule to switch at current period end; release existing schedules first.
   - Legacy handling: migrate classic subscriptions to flexible; replace single metered item with plan+usage or vice versa.

3. **Cancellation / Reactivation**
   - Cancel sets `cancel_at_period_end` (or clears `cancel_at`); reactivate clears cancellation flags.
   - Both release any active/not-started subscription schedules first.

4. **Cloud Config**
   - `cloudConfig.stripe`: `customerId`, `activeSubscriptionId`, `activeProductId`, `activeUsageProductId`.
   - Entitlements derive from `activeProductId` and catalogue mapping.
   - If `plan` is set (manual override), creating/changing subscriptions is blocked until removed.

### Usage-Based Pricing

1. **Usage Meter in Stripe**
   - Usage is tracked at the Stripe customer level via a meter on the usage item.
   - The worker reports usage periodically for all orgs with a Stripe customer.

2. **Hourly Job**
   - Runs in the worker (`cloudUsageMeteringQueue`).
   - Aggregates last-hour observations and posts to Stripe usage.
   - Governed by BullMQ repeatables and `cron_jobs` table to ensure singleton execution/backfill.

### Webhooks

See `web/src/ee/features/billing/server/stripeWebhookHandler.ts`.

- Validates signature; ensures events are handled only in the correct `cloudRegion`.
- Ensures subscription metadata (`orgId`, `cloudRegion`) is set (falls back to checkout session lookup if needed).
- On subscription created/updated: writes `customerId`, `activeSubscriptionId`, `activeProductId`, `activeUsageProductId` to org `cloudConfig`; on deleted: clears active IDs.
- On `invoice.created`: recreates usage alert to make alerts fire once per billing period.
- On `billing.alert.triggered`: emails admins/owners and configured recipients.
- Invalidates org API keys after subscription changes.

## Testing

Lightweight guidance for local/staging testing. Stripe docs are solid references.

1. Create a test clock in the Stripe sandbox
   - Use the Stripe Dashboard Test Clocks page: [Test Clocks](https://dashboard.stripe.com/test/billing/subscriptions/test-clocks/).
   - Create up to three users tied to the clock (e.g., "Test User A", "Test User B").
2. Prepare an organization in your environment (local or staging)
   - Insert the Stripe customer on the org DB by setting `cloudConfig` to:

```json
{ "stripe": { "customerId": "cus_T2dbT3t6hyp9RE" } }
```

- Note: Required because test clocks cannot be used with existing customers; first create them on the clock.

3. Local-only notes
   - Build and run without dev hot-reload to avoid dropped webhook events:

```bash
NODE_OPTIONS="--max-old-space-size=8192" pnpm build && pnpm start
```

- Listen to webhooks:

```bash
stripe listen --forward-to localhost:3000/api/billing/stripe-webhook
```

4. Staging notes
   - Ensure `STRIPE_WEBHOOK_SIGNING_SECRET` and `STRIPE_SECRET_KEY` point to sandbox and have correct permissions.
5. Exercise scenarios
   - Use Stripe Workbench → Shell to send meter events; advance the test clock (only forward in time).
   - Change subscriptions from the UI; advance time; send events; verify invoices/alerts.
   - Events must be sent with the current date of the test clock.

## Current Limitations

- The Stripe Billing Portal cannot be used for plan switches. Plan changes must go through our API. The client shows an alert explaining implications but does not present a dedicated checkout page for switching plans.
- Stripe is rolling out a v2 of usage-based billing APIs (private beta as of 2025-09). If revisited, consider adopting v2 to reduce maintenance and custom logic.
