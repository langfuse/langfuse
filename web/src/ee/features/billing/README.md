# Billing

## Webhook development

You can test webhooks via the `stripe` CLI. Step by step guide: https://dashboard.stripe.com/test/webhooks/create?endpoint_location=local

1. `stripe login`
2. `stripe listen --forward-to localhost:3000/api/billing/stripe-webhook`
