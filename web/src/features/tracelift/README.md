# Trace fixes UI preview

`TraceliftPanelContent` renders findings passed by its caller. Each condition has
three actions: copy a coding-agent prompt, open the assistant with that prompt,
or inspect example observations. `TraceliftFindingSection` owns clipboard
feedback; the caller owns navigation, assistant integration, and panel lifetime.

The preview fixtures are illustrative, not detector output. Their observation
IDs match the `support-agent` seed scenario with the `tracelift-support` prefix so
the navigation flow can be tested with local demo data. The sidebar header displays
the total erroneous observations and combined Langfuse ingestion cost in USD for
the last 30 days across all conditions. Its `summary` is supplied separately from
the findings so overlapping conditions need not double-count observations or cost.
Each condition has a compact Show IDs control beside View observations. Counts
and IDs match the selected seed observations. The Preview badge identifies this
UI-only state; no explanatory sample banner is shown. Ingestion costs are illustrative values, not
actual billed amounts or the observations' recorded model costs. The detection
and billing integration must supply `langfuseIngestionCostUsd` independently of
model cost. No billing-rate calculation is implemented in this UI.

Product analytics are intentionally deferred while this is a UI preview. No
prompts, observation names, or findings are sent to analytics. Browser clipboard
denial displays a retry message and does not report an error to Sentry.

## Local preview

Use the development setup in `CONTRIBUTING.md`, with OrbStack as the Docker
runtime on macOS. Enable the existing internal features in your untracked `.env`
with `LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true`. To exercise the assistant draft
handoff, also set `LANGFUSE_IN_APP_AGENT_ENABLED=true`; opening a draft does not
submit a model request.

```bash
pnpm run seed -- doctor
pnpm run seed -- support-agent --v4 --id-prefix tracelift-support
pnpm run dev:web
```

Sign in at `http://localhost:3000` with `demo@langfuse.com` / `password`, open the
seeded **llm-app** project's **Tracing** page, then click the orange **Trace fixes**
badge. Check each condition's copy, assistant draft, and observations actions.
The preview uses the listed observation IDs and a 30-day window for table
links. Both prompt actions include those IDs and the same time-window context.
Production detection will need to supply the actual findings and their metrics.

The panel stories cover two, three, and seven conditions, plus an empty state.
