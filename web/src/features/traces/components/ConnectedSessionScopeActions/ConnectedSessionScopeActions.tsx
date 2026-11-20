import { type ComponentProps } from "react";
import { MoreVertical, Webhook } from "@langfuse/icons";
import { type TraceDetailActions } from "../TraceDetailActions";
import { useSessionHeaderMenuItems } from "@/src/features/sessions/useSessionHeaderMenuItems";
import { useWebCalloutAction } from "@/src/features/web-callouts/components/useWebCalloutAction";
import { useSessionScopeActionsData } from "@/src/features/traces/hooks/useSessionScopeActionsData";

export function ConnectedSessionScopeActions({
  projectId,
  sessionId,
  isPlaceholderData,
  children,
}: Pick<
  ComponentProps<typeof TraceDetailActions>,
  "children" | "isPlaceholderData"
> & {
  projectId: string;
  sessionId: string;
}) {
  const session = useSessionScopeActionsData({ projectId, sessionId });
  const webCalloutAction = useWebCalloutAction(
    { projectId, traceId: null, observationId: null, sessionId },
    true,
  );
  const items = useSessionHeaderMenuItems({
    projectId,
    sessionId,
    isPublic: session.data?.public ?? false,
    shareUrl: `/project/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`,
  });
  return children([
    ...(webCalloutAction
      ? [
          {
            id: "web-callout",
            type: "button" as const,
            label: `Call ${webCalloutAction.endpointName}`,
            icon: Webhook,
            iconOnly: true,
            disabled: isPlaceholderData || webCalloutAction.isLoading,
            isLoading: webCalloutAction.isLoading,
            onClick: () => {
              webCalloutAction.invokeCallout().catch(() => undefined);
            },
          },
        ]
      : []),
    {
      id: "session-options",
      type: "dropdown",
      label: "Session actions",
      icon: MoreVertical,
      iconOnly: true,
      placement: "trailing",
      disabled: isPlaceholderData || !session.data,
      items,
    },
  ]);
}
