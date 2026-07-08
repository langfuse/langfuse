# Telemetry service for Docker deployments

By default, Langfuse automatically reports basic usage statistics to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

The telemetry does not include raw traces, prompts, observations, scores, or dataset contents. We document the exact fields that are collected, where they are sent, and the implementation reference in our [telemetry docs](https://langfuse.com/self-hosting/security/telemetry).

For Langfuse OSS, you can opt out by setting `TELEMETRY_ENABLED=false`.
