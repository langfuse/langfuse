# Feature Flags

Configure feature flags in the `available-flags.ts` file.

Use the `useIsFeatureEnabled` hook to check if a feature flag is enabled.

```tsx
const isFeatureEnabled = useIsFeatureEnabled("feature-flag-name");
```

When is a feature flag enabled?

1. flag is in user.feature_flags
2. LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES is set
3. user.admin is true
