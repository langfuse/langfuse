# Setup Billing Alerts Script

This script is a one-time migration utility that sets up default billing alerts for existing organizations with active Stripe subscriptions.

## Purpose

When the billing alerts feature was introduced, existing organizations with active Stripe subscriptions needed to be migrated to have default billing alert configurations. This script automates that process.

## What it does

1. **Finds eligible organizations**: Searches for organizations that have:
   - An active Stripe subscription (`activeSubscriptionId` exists)
   - No existing billing alerts configuration

2. **Creates Stripe alerts**: For each eligible organization, creates a Stripe billing alert with:
   - $1,000 USD threshold (default)
   - Attached to the `tracing_events` meter
   - One-time alert type (triggers once per billing cycle)

3. **Updates organization configuration**: Adds the billing alerts configuration to the organization's `cloudConfig` with:
   - `enabled: true`
   - `thresholdAmount: 1000` (USD)
   - `currency: "USD"`
   - `stripeAlertId`: The ID of the created Stripe alert
   - `notifications.email: true`
   - `notifications.recipients: []` (empty, will use admin emails)

## Usage

### Preparation

Create a `.env` file in the repository root with the following content:

```bash
# TODO
```

### Running the script

```bash
pnpm run --filter=worker... build
cd worker
dotenv -e ../.env -- tsx src/scripts/setupBillingAlerts/index.ts
```
