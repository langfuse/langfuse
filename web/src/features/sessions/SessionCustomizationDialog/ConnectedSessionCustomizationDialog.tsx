import { type ComponentProps, useState } from "react";
import { api } from "@/src/utils/api";
import { SessionCustomizationDialog } from "./SessionCustomizationDialog";

export function ConnectedSessionCustomizationDialog({
  sessionId,
  sessionIds,
  isOpen,
  ...props
}: Pick<
  ComponentProps<typeof SessionCustomizationDialog>,
  | "projectId"
  | "initialFilters"
  | "initialUnmatchedTraces"
  | "initialViewMode"
  | "onApply"
> & { sessionId: string; sessionIds: string[]; isOpen: boolean }) {
  const [selectedSessionId, setPreviewSessionId] = useState(sessionId);
  const sessions = sessionIds.includes(sessionId) ? sessionIds : [sessionId];
  const previewSessionId = sessions.includes(selectedSessionId)
    ? selectedSessionId
    : sessionId;
  const index = sessions.indexOf(previewSessionId);
  const preview = api.sessions.previewTree.useQuery(
    { projectId: props.projectId, sessionId: previewSessionId },
    { enabled: isOpen },
  );

  return (
    <SessionCustomizationDialog
      {...props}
      preview={{
        navigation: {
          sessionId: previewSessionId,
          isCurrentSession: previewSessionId === sessionId,
          position: index + 1,
          total: sessions.length,
          onPrevious:
            index > 0
              ? () => setPreviewSessionId(sessions[index - 1])
              : undefined,
          onNext:
            index >= 0 && index < sessions.length - 1
              ? () => setPreviewSessionId(sessions[index + 1])
              : undefined,
        },
        traces: preview.data,
        pending: preview.isFetching,
        error: preview.error?.message,
      }}
    />
  );
}
