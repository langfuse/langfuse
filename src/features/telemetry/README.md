# Telemetry service for Docker deployments

By default, Langfuse automatically reports basic usage statistics to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/src/features/telemetry/index.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.
