import { type ComponentProps } from "react";
import { api } from "@/src/utils/api";
import { toObservedOptions } from "@/src/features/search-bar";
import { SessionCustomizationDialog } from "./SessionCustomizationDialog";

export function ConnectedSessionCustomizationDialog({
  sessionId,
  isOpen,
  ...props
}: Pick<
  ComponentProps<typeof SessionCustomizationDialog>,
  "projectId" | "initialFilters" | "initialUnmatchedTraces" | "onApply"
> & { sessionId: string; isOpen: boolean }) {
  const preview = api.sessions.previewTree.useQuery(
    { projectId: props.projectId, sessionId },
    { enabled: isOpen },
  );
  const options = api.sessions.filterOptionsFromEvents.useQuery(
    { projectId: props.projectId },
    { enabled: isOpen },
  );
  const observed = toObservedOptions(
    options.data ? { traceTags: options.data.tags } : undefined,
    options.isPending,
  );

  return (
    <SessionCustomizationDialog
      {...props}
      observed={observed}
      preview={{
        traces: preview.data,
        pending: preview.isFetching,
        error: preview.error?.message,
      }}
    />
  );
}
