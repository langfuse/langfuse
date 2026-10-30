// The multi-tenant-sso feature's public client surface (RFC rule 8).
// Named re-exports only — the provider schema SSO settings already
// imported by file path. utils stay on server/index.ts.
export { SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";
