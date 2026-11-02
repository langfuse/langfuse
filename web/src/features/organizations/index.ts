// The organizations feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported from this
// feature's client modules.
//
// `server/` is a separate door. organizationsRouter stays a direct import
// from the tRPC root. canCreateOrganizations, organizationNameSchema, and
// buildAdminOrgContext live on `server/index.ts` so this client barrel
// never reaches auth/onboarding.
//
// ConnectedNewOrganizationForm, OrganizationProjectOverview, and
// useOrganizationSettingsPages stay off this door. The barrel is already
// imported by projects/hooks (useQueryOrganization); adding the settings
// page would pull ai-gateway and search-bar into every useQueryProject
// consumer, including filter-builder on the filters door that
// ComposerTokens already imports.
export {
  getAvailableCloudRegionOptions,
  getCloudRegionAuthUrl,
  isRegionProduction,
  type CloudRegion,
  type CloudRegionName,
} from "@/src/features/organizations/cloudRegions";
export {
  AIFeaturesDisabledNotice,
  openAIFeaturesSettings,
} from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
export {
  useLangfuseCloudRegion,
  useLangfuseV4WriteMode,
  useQueryOrganization,
} from "@/src/features/organizations/hooks";
