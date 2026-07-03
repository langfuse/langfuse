// Parquet is being promoted from the internal `exportTuning.parquet` knob to a
// first-class `fileType = PARQUET` output format. While it stabilises, the
// selectable option is limited to an in-code whitelist of project IDs rather
// than offered to everyone.
//
// This module is client-safe (no server imports): the settings form reads it to
// decide whether to render the Parquet option, and the tRPC `update` mutation
// reads it to reject the value from non-whitelisted projects (defense in depth).
//
// Existing projects already exporting Parquet via `exportTuning.parquet` do NOT
// need to be listed here — that legacy override path keeps working independently
// (see the worker's `parquetEligible`). This list only gates the new
// UI-selectable fileType.

export const PARQUET_FILE_TYPE_PROJECT_IDS: readonly string[] = [
  "cmpyefoyg03yiad0jeoymrmcv",
];

const PARQUET_FILE_TYPE_PROJECT_ID_SET = new Set(PARQUET_FILE_TYPE_PROJECT_IDS);

/** True when a project may select the first-class Parquet fileType. */
export function isParquetFileTypeAllowed(projectId: string): boolean {
  return PARQUET_FILE_TYPE_PROJECT_ID_SET.has(projectId);
}
