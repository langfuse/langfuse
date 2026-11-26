# Feature Flags

Configure feature flags in the `available-flags.ts` file.

Use the `useIsFeatureEnabled` hook to check if a feature flag is enabled.

```tsx
const isFeatureEnabled = useIsFeatureEnabled("feature-flag-name");
```

When is a feature flag enabled?

1. `LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES` is set
2. the active project or organization's defaults turn the flag on
3. the user's `feature_flags` contains the flag
4. the preview is enabled by default and has not been opted out of

Ordinary feature flags respect preferences regardless of admin status. The deployment-wide `LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES` override still forces ordinary flags on; restricted flags and internal previews require their explicit availability or grant.

Internal view is available to users with an account email ending exactly in `@langfuse.com` or `@clickhouse.com` (case-insensitive, no subdomains), and deployments with experimental features enabled. Eligible users can switch view modes through their account menu, including on self-hosted deployments without Fast (Preview). Authenticated users can always opt out of Internal view. Email eligibility grants access to internal surfaces only; it does not change project membership or RBAC permissions.

`traceTranscriptEvals` is an internal personal preview, excluded from organization defaults and member management, but its toggle is visible to anyone who belongs to at least one project on the trace evals allowlist, so those users can opt in and out themselves. It is still visible in Internal view or with an existing personal grant. Internal view shows it as enabled and disables editing; otherwise a project member can turn it on and off. Feature access also requires the [trace evals access gate](../evals/transcriptEvalsAccess.ts).

Internal personal previews are registered in `internalFeaturePreviewFlags`; the personal modal and self-toggle mutation use `personalFeaturePreviewFlags`. Keep `featurePreviewFlags` limited to previews organizations may manage.

Unified Trace and Session View uses the same Internal view or existing personal grant access for its preview toggle. It remains an explicit opt-in, including in Internal view and experimental deployments, and requires the events-backed read path.

Organization defaults are evaluated only for the active project or
organization. They are never copied into users and never unioned across all of
a user's memberships. A `feature-preview:<flag>:disabled` entry in
`users.feature_flags` is a global opt-out and wins over every organization
default.
