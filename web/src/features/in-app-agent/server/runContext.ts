import {
  type FilterState,
  LangfuseNotFoundError,
  TableViewPresetTableName,
} from "@langfuse/shared";
import type { AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];
import {
  logger,
  parseSavedViewFromURL,
  TableViewService,
} from "@langfuse/shared/src/server";

import { sanitizeInAppAgentContext } from "@/src/features/in-app-agent/context";

/**
 * Resolve and sanitize the AG-UI context items for a turn.
 *
 * Shared by the two submit paths: the foreground handler resolves at request
 * time, and `startRun` resolves at submit time and stores the result in the
 * run's request payload — so the worker replays a context that was resolved
 * against the state the user actually saw, and never has to reach for a saved
 * view that may since have been deleted.
 */
export async function resolveInAppAgentRunContext(params: {
  context: InAppAgentContext;
  projectId: string;
  isV4Enabled: boolean;
}): Promise<InAppAgentContext> {
  const currentUrlContext = params.context.find(
    (item) => item.description === "current_url",
  );
  const selectedSavedView = currentUrlContext
    ? parseSavedViewFromURL(currentUrlContext.value, params.isV4Enabled)
    : undefined;

  let viewFilters: FilterState | undefined;

  if (selectedSavedView) {
    try {
      const { filters, tableName } =
        await TableViewService.getTableViewPresetsById(
          selectedSavedView.viewId,
          params.projectId,
        );

      if (
        tableName === selectedSavedView.tableName ||
        (selectedSavedView.tableName ===
          TableViewPresetTableName.ObservationsEvents &&
          tableName === TableViewPresetTableName.Observations)
      ) {
        viewFilters = filters;
      }
    } catch (error) {
      // Saved views can be deleted while their URLs remain open or shared.
      if (!(error instanceof LangfuseNotFoundError)) {
        logger.warn("Failed to resolve saved view for in-app agent context", {
          error,
          projectId: params.projectId,
          savedViewId: selectedSavedView.viewId,
        });
      }
    }
  }

  return sanitizeInAppAgentContext(
    params.context,
    params.projectId,
    viewFilters,
  );
}
