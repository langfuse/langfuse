// The datasets feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported. The public-API dataset
// services live behind server/index.ts.
export { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
export type { DatasetFormRef } from "@/src/features/datasets/components/DatasetForm";
export { DatasetSchemaHoverCard } from "@/src/features/datasets/components/DatasetSchemaHoverCard";
export { DiffLabel } from "@/src/features/datasets/components/DiffLabel";
export { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";
export { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
export { useDatasetItemFromTraceOrObservation } from "@/src/features/datasets/hooks/useDatasetItemFromTraceOrObservation";
export { calculateNumericDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
export type { BaselineDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
export { computeScoreDiffs } from "@/src/features/datasets/lib/computeScoreDiffs";
