# Billing

## Overview

This page outlines our integration with **Stripe billing**. The integration supports **usage-based billing** for each organization and project within our product.

## Key Concepts

- **Organizations**: Entities within the product that can have multiple projects.
- **Projects**: Sub-entities under organizations where usage is tracked.
- **Observations**: Units of usage, essentially API calls, tracked at the project level and aggregated for billing on the organization level.

## Implementation Details

### Checkout and Subscription Management

1. **Upgrade Process**:

   - Organizations can upgrade their plan via the **billing settings**.
   - On the **select plans popup**, only product listed in `stripeProducts.ts` are included.
   - A new **Stripe Checkout session** is created via the API.
     - The **organization ID** is passed to Stripe as a reference.
     - The default price in stripe for each product is used.

2. **Stripe WebHooks**:

   - **Checkout Session Completion**:
     - On completion, the `customerID` and `activeSubscriptionId` are added to the cloud config of the organization's object.
     - Linked based on the stripe client reference (`stripeClientReference.ts`).
   - **Subscription Changes**:
     - On creation, update, or deletion of a subscription, the **active product ID** is updated in the cloud config of the organization which includes the `activeSubscriptionId`.

3. **Cloud Config**:
   - Contains the **customer ID**, **activeSubscriptionId**, and **active product ID**.
   - All entitlements within the application are based on the **active product ID** and it's mapping to `Plan` in Langfuse (`stripeProducts.ts`).
   - If a `plan` is included in the cloud config (legacy), no new subscription can be created for the organization. Organizations need to be migrated to the new system.

### Usage-Based Pricing

1. **Usage Meter in Stripe**:

   - A meter with the ID `trace_observations` is used to track usage.
   - This meter tracks observations at the _customer_ level within Stripe.

2. **Hourly Job**:

   - An hourly job runs in the **worker container** (`cloudUsageMeteringQueue`).
   - Logs the number of observations within the last hour to Stripe for all organizations which include a customer ID in the cloud config.
   - The job is managed via
     - BullMQ repeatable jobs: trigger run each hour + potential backfill job on startup of worker container
     - `cron_jobs` postgres table to track the last run time of the job and to prevent multiple instances of the job running.

## Webhook development

You can test webhooks via the `stripe` CLI. Step by step guide: https://dashboard.stripe.com/test/webhooks/create?endpoint_location=local

1. `stripe login`
2. `stripe listen --forward-to localhost:3000/api/billing/stripe-webhook`
3. Add the API key from the Stripe test environment and the webhook signing secret from the CLI to the `.env` file.

Upgrade/downgrade projects via the Langfuse billing settings.
