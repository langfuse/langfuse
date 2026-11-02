import { env } from "@/src/env.mjs";
import { LangfuseNotFoundError } from "@langfuse/shared";

/**
 * The dataset run (item) tools read from and write to the legacy
 * dataset_run_items ClickHouse table, which is no longer populated when
 * LANGFUSE_MIGRATION_V4_WRITE_MODE is "events_only". Refuse them like the
 * corresponding public REST routes do (rejectInEventsOnlyMode), pointing to
 * the experiments surface instead.
 */
export const rejectDatasetRunToolsInEventsOnlyMode = (): void => {
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only") {
    throw new LangfuseNotFoundError(
      "This tool is not available on deployments running in Langfuse v4 events_only mode. Use the experiments tools instead. Learn more about Langfuse v4 at: https://langfuse.com/docs/v4",
    );
  }
};
