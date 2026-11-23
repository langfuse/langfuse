import { env } from "@/src/env.mjs";
import { V4_CUTOFF_NOTICE } from "@/src/features/public-api/server/deprecations";
import { isWebV4CutoffActive } from "@/src/features/public-api/server/v4Cutoff";
import { LangfuseNotFoundError } from "@langfuse/shared";

/**
 * The dataset run (item) tools read from and write to the legacy
 * dataset_run_items ClickHouse table. They are refused when that table is no
 * longer populated (LANGFUSE_MIGRATION_V4_WRITE_MODE is "events_only") and on
 * Langfuse Cloud once the v3 public API cutoff applies to the project, like
 * the corresponding deprecated public REST routes. Both point to the
 * experiments tools instead.
 */
export const rejectLegacyDatasetRunTools = (projectId: string): void => {
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only") {
    throw new LangfuseNotFoundError(
      "This tool is not available on deployments running in Langfuse v4 events_only mode. Use the experiments tools instead. Learn more about Langfuse v4 at: https://langfuse.com/docs/v4",
    );
  }

  if (isWebV4CutoffActive("public_api", projectId)) {
    throw new LangfuseNotFoundError(
      `This tool reads and writes Langfuse v3 dataset runs and has been removed from Langfuse Cloud. ${V4_CUTOFF_NOTICE} Use the experiments tools (listExperiments, listExperimentItems) instead. Learn more about Langfuse v4 at: https://langfuse.com/docs/v4`,
    );
  }
};
