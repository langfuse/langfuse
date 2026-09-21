// The organizations feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported from this
// feature's client modules.
//
// `server/` is a separate door. organizationsRouter stays a direct import
// from the tRPC root. canCreateOrganizations, organizationNameSchema, and
// buildAdminOrgContext live on `server/index.ts` so this client barrel
// (hooks, settings pages, forms) never reaches auth/onboarding.
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
export { ConnectedNewOrganizationForm } from "@/src/features/organizations/components/ConnectedNewOrganizationForm";
export { OrganizationProjectOverview } from "@/src/features/organizations/components/ProjectOverview";
export {
  useLangfuseCloudRegion,
  useLangfuseV4WriteMode,
  useQueryOrganization,
} from "@/src/features/organizations/hooks";
export { useOrganizationSettingsPages } from "@/src/features/organizations/OrganizationSettingsPage";
