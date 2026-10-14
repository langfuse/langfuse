// The table feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported from this feature's
// client modules.
//
// `server/` is a separate door. tableRouter stays a direct import from the
// tRPC root, which is not a feature. createBatchActionJob lives on
// `server/index.ts` so this client barrel never reaches instrumentation.
export { TableActionMenu } from "@/src/app/tables/components/TableActionMenu";
export { TableSelectionManager } from "@/src/app/tables/components/TableSelectionManager";
export { useSelectAll } from "@/src/app/tables/hooks/useSelectAll";
export type { TableAction } from "@/src/app/tables/types";
