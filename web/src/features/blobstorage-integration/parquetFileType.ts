// In-code whitelist gating the first-class `fileType = PARQUET` option while
// it stabilises. Projects on the legacy `exportTuning.parquet` override do not
// need to be listed here — that path is independent (see worker parquetEligible).

export const PARQUET_FILE_TYPE_PROJECT_IDS: readonly string[] = [
  "cmpyefoyg03yiad0jeoymrmcv",
];

const PARQUET_FILE_TYPE_PROJECT_ID_SET = new Set(PARQUET_FILE_TYPE_PROJECT_IDS);

/** True when a project may select Parquet as its fileType. */
export function isParquetFileTypeAllowed(projectId: string): boolean {
  return PARQUET_FILE_TYPE_PROJECT_ID_SET.has(projectId);
}
