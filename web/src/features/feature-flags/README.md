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

Internal view is available to platform admins, users with an account email ending exactly in `@langfuse.com` or `@clickhouse.com` (case-insensitive, no subdomains), and deployments with experimental features enabled. Eligible users can switch view modes through their account menu, including on self-hosted deployments without Fast (Preview). Authenticated users can always opt out of Internal view. Email eligibility grants access to internal surfaces only; it does not change `user.admin`, project membership, or RBAC permissions.

Topics is available through internal view or the `langfuseTopics` ("Langfuse Topics") personal flag. Internal view follows the shared internal eligibility and opt-out rules; its sidebar entry carries the Internal badge. The personal preview toggle is visible and may be changed only with active Internal view or an existing personal Topics grant. Admin status alone does not grant toggle access after opting out of Internal view. The flag is excluded from public previews, organization defaults, and member preview management. Both access paths still require the Topics project/deployment gate and `topics:read` permission. While Internal view is on, the Topics preview toggle shows as enabled and cannot be changed. Switching to External view hides Topics unless the personal flag is enabled. Users with an existing grant can disable it in External view; without Internal view, they cannot grant themselves access again.

Internal personal previews are registered in `internalFeaturePreviewFlags`; the personal modal and self-toggle mutation use `personalFeaturePreviewFlags`. Keep `featurePreviewFlags` limited to previews organizations may manage.

Organization defaults are evaluated only for the active project or
organization. They are never copied into users and never unioned across all of
a user's memberships. A `feature-preview:<flag>:disabled` entry in
`users.feature_flags` is a global opt-out and wins over every organization
default.
