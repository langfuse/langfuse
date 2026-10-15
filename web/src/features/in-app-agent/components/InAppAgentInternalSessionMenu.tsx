"use client";

import { Copy, ExternalLink, MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";

function getOpenSessionItem({
  conversationId,
  isError,
  isPending,
  telemetryProjectId,
}: {
  conversationId: string;
  isError: boolean;
  isPending: boolean;
  telemetryProjectId: string | null;
}): DropdownMenuItemDefinition {
  const item = {
    type: "item",
    id: "open-session",
    title: "Open session in Langfuse",
    icon: ExternalLink,
  } as const;
  // A disabled button, not a placeholder link, so middle-click cannot open a tab.
  const unavailable = (reason: string): DropdownMenuItemDefinition => ({
    ...item,
    disabled: { reason },
    onClick: () => undefined,
  });

  if (isPending) {
    return unavailable("Loading the telemetry project.");
  }
  if (isError) {
    return unavailable("Could not load the telemetry project.");
  }
  if (!telemetryProjectId) {
    return unavailable(
      "Halo telemetry is not recorded for this organization or instance.",
    );
  }
  return {
    ...item,
    href: `/project/${encodeURIComponent(telemetryProjectId)}/sessions/${encodeURIComponent(conversationId)}`,
    linkTarget: "_blank",
  };
}

/**
 * Debug shortcuts for the Langfuse team: assistant turns are traced into the
 * instance's AI-features project with the conversation id as session id.
 */
export function InAppAgentInternalSessionMenu({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string;
}) {
  const telemetryProject = api.inAppAgent.telemetryProject.useQuery(
    { projectId },
    { meta: { silentAllErrors: true } },
  );

  const items: DropdownMenuItemDefinition[] = [
    {
      type: "item",
      id: "copy-session-id",
      title: "Copy session ID",
      icon: Copy,
      onClick: () => {
        copyTextToClipboard(conversationId)
          .then(() => {
            showSuccessToast({
              operation: "in_app_agent_session_id.copy",
              title: "Session ID copied",
              description: conversationId,
              duration: 2000,
            });
          })
          .catch(() => undefined);
      },
    },
    getOpenSessionItem({
      conversationId,
      isError: telemetryProject.isError,
      isPending: telemetryProject.isPending,
      telemetryProjectId: telemetryProject.data?.projectId ?? null,
    }),
  ];

  return (
    <DropdownMenu
      ariaLabel="Internal session actions"
      internal
      items={items}
      placement="bottom-start"
    >
      {({ getTriggerProps }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label="Internal session actions"
          {...getTriggerProps()}
        >
          <MoreHorizontal className="icon-base text-icon-foreground" />
        </Button>
      )}
    </DropdownMenu>
  );
}
