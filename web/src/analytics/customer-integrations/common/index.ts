// The analytics-integrations feature's public client surface (RFC rule 8).
// Named re-exports only — the export-source UI adapters and settings
// skeleton other features already imported by file path.
//
// server/exportSource, displayCredential, and isPrismaRecordNotFoundError
// live on server/index.ts. Routers stay off this door.
export { IntegrationSettingsSkeleton } from "@/src/analytics/customer-integrations/common/components/IntegrationSettingsSkeleton";
export {
  buildExportSourceContext,
  getExportSourceFieldState,
  getExportSourceFormValue,
  getExportSourceOptions,
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
} from "@/src/analytics/customer-integrations/common/exportSource";
