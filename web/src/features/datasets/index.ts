// The datasets feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported. The public-API dataset
// services live behind server/index.ts.
export { DatasetForm } from "./components/DatasetForm";
export type { DatasetFormRef } from "./components/DatasetForm";
export { DatasetSchemaHoverCard } from "./components/DatasetSchemaHoverCard";
export { DiffLabel } from "./components/DiffLabel";
export { ExistingDatasetItemsDropdownMenuController } from "./components/ExistingDatasetItemsDropdownMenuController";
export { NewDatasetItemFromExistingObjectDialogController } from "./components/NewDatasetItemFromExistingObjectDialogController";
export { useDatasetItemFromTraceOrObservation } from "./hooks/useDatasetItemFromTraceOrObservation";
export { calculateNumericDiff } from "./lib/calculateBaselineDiff";
export type { BaselineDiff } from "./lib/calculateBaselineDiff";
export { computeScoreDiffs } from "./lib/computeScoreDiffs";
