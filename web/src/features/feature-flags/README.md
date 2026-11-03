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
4. `user.admin` is true for consumers that keep the admin bypass enabled

User-controlled previews may pass `{ enableForAdmins: false }` so an
administrator can opt in or out like any other user. The deployment-wide
`LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES` override still forces flags on.

Topics is available through internal view or the `langfuseTopics` ("Langfuse
Topics") personal flag. Internal view follows the shared internal eligibility
and opt-out rules; its sidebar entry carries the Internal badge. Only platform
administrators (`user.admin`) see or may change the personal preview toggle;
organization administrator roles do not grant toggle access. The flag is
excluded from public previews, organization defaults, and member preview
management. Both access paths still require the Topics project/deployment gate
and `topics:read` permission.
While Internal view is on, the Topics preview toggle shows as enabled and
cannot be changed. Switch to External view to manage the personal flag.

Admin-only personal previews are registered in `adminOnlyFeaturePreviewFlags`;
the personal modal and self-toggle mutation use `personalFeaturePreviewFlags`.
Keep `featurePreviewFlags` limited to previews organizations may manage.

Organization defaults are evaluated only for the active project or
organization. They are never copied into users and never unioned across all of
a user's memberships. A `feature-preview:<flag>:disabled` entry in
`users.feature_flags` is a global opt-out and wins over every organization
default.
