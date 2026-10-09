// The ui-customization feature's public client surface (RFC rule 8).
// Named re-exports only — exactly what other features already imported.
//
// instanceLinks and productModuleSchema stay deep: layout and the
// uiCustomization router are not features, and routing those files
// through here would pull the React hook into tRPC.
export { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
