import { MoreVertical, Webhook } from "@langfuse/icons";
import { type EntityDetailHeaderAction } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { useSessionHeaderMenuItems } from "@/src/features/sessions/useSessionHeaderMenuItems";
import { useWebCalloutAction } from "@/src/features/web-callouts/components/useWebCalloutAction";
import { useSessionScopeActionsData } from "./useSessionScopeActionsData";

export function useSessionScopeActions({
  projectId,
  sessionId,
  isPlaceholderData,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  isPlaceholderData: boolean | undefined;
  enabled: boolean;
}): readonly EntityDetailHeaderAction[] {
  const session = useSessionScopeActionsData({ projectId, sessionId, enabled });
  const webCalloutAction = useWebCalloutAction(
    { projectId, traceId: null, observationId: null, sessionId },
    enabled,
  );
  const items = useSessionHeaderMenuItems({
    projectId,
    sessionId,
    isPublic: session.data?.public ?? false,
    shareUrl: `/project/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`,
  });
  return [
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
  ];
}
