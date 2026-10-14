// The multi-tenant-sso feature's server surface (RFC rule 9, amended):
// domain lookup helpers auth already imported by file path.
export {
  findMultiTenantSsoConfig,
  getSsoAuthProviderIdForDomain,
  isAnySsoConfigured,
  loadSsoProviders,
} from "@/src/ee/identity/auth/sso-runtime/utils";
