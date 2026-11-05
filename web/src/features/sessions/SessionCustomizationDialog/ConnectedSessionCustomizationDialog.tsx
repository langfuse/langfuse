import { type ComponentProps } from "react";
import { api } from "@/src/utils/api";
import { SessionCustomizationDialog } from "./SessionCustomizationDialog";

export function ConnectedSessionCustomizationDialog({
  sessionId,
  isOpen,
  ...props
}: Pick<
  ComponentProps<typeof SessionCustomizationDialog>,
  | "projectId"
  | "initialFilters"
  | "initialUnmatchedTraces"
  | "initialViewMode"
  | "onApply"
> & { sessionId: string; isOpen: boolean }) {
  const preview = api.sessions.previewTree.useQuery(
    { projectId: props.projectId, sessionId },
    { enabled: isOpen },
  );

  return (
    <SessionCustomizationDialog
      {...props}
      preview={{
        traces: preview.data,
        pending: preview.isFetching,
        error: preview.error?.message,
      }}
    />
  );
}
