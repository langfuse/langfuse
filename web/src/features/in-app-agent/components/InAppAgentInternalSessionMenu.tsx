"use client";

import { Copy, ExternalLink, MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";

function getOpenSessionDisabled({
  isPending,
  telemetryProjectId,
}: {
  isPending: boolean;
  telemetryProjectId: string | null;
}): { reason: string } | undefined {
  if (isPending) {
    return { reason: "Loading the telemetry project." };
  }
  if (!telemetryProjectId) {
    return {
      reason:
        "Assistant telemetry is not recorded for this organization or instance.",
    };
  }
  return undefined;
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
    { staleTime: Infinity, retry: false },
  );
  const telemetryProjectId = telemetryProject.data?.projectId ?? null;
  const openSessionDisabled = getOpenSessionDisabled({
    isPending: telemetryProject.isPending,
    telemetryProjectId,
  });

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
              title: "Session ID copied",
              description: conversationId,
              duration: 2000,
            });
          })
          .catch(() => undefined);
      },
    },
    {
      type: "item",
      id: "open-session",
      title: "Open session in Langfuse",
      icon: ExternalLink,
      disabled: openSessionDisabled,
      href: telemetryProjectId
        ? `/project/${encodeURIComponent(telemetryProjectId)}/sessions/${encodeURIComponent(conversationId)}`
        : "#",
      linkTarget: "_blank",
    },
  ];

  return (
    <DropdownMenu
      ariaLabel="Internal session actions"
      titleBadge={<InternalFeatureBadge />}
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
          <MoreHorizontal className="size-3" />
        </Button>
      )}
    </DropdownMenu>
  );
}
