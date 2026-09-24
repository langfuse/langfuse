// The feature-flags feature's public client surface (RFC rule 8). Named
// re-exports only — the preview-flag catalog and enablement hook other
// features already imported by file path.
//
// OrganizationFeaturePreviewsSettings and UserFeaturePreviewsControl stay
// off this door: IOPreview and FeaturePreviewModal import the hook/catalog,
// and putting the settings UI here would load it into every trace IO
// preview. available-flags is also on the server door for server callers
// (rule 10). Pages stay off this door.
export { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
export { useInternalFeaturesEnabled } from "./hooks/useInternalFeaturesEnabled";
export { InternalFeatureBadge } from "./components/InternalFeatureBadge";
export {
  featurePreviewLabels,
  type FeaturePreviewFlag,
} from "@/src/features/feature-flags/available-flags";
