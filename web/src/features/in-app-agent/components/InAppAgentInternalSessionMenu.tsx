"use client";

import {
  Copy,
  ExternalLink,
  type IconComponent,
  Link,
  MoreHorizontal,
} from "@langfuse/icons";

import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type TelemetryProject = RouterOutputs["inAppAgent"]["telemetryProject"];

const unavailableReasonMessages: Record<
  NonNullable<TelemetryProject["unavailableReason"]>,
  string
> = {
  telemetry_disabled: "This organization has opted out of AI telemetry.",
  not_configured: "This instance has no AI telemetry project configured.",
  no_access: "You need access to the AI telemetry project to open sessions.",
};

type SessionLink =
  | { path: string; openDisabledReason: string | null }
  | { path: null; disabledReason: string };

function resolveSessionLink({
  conversationId,
  data,
  isError,
  isPending,
}: {
  conversationId: string;
  data: TelemetryProject | undefined;
  isError: boolean;
  isPending: boolean;
}): SessionLink {
  if (isPending) {
    return { path: null, disabledReason: "Loading the telemetry project." };
  }
  if (isError || !data) {
    return {
      path: null,
      disabledReason: "Could not load the telemetry project.",
    };
  }
  if (!data.projectId) {
    return {
      path: null,
      disabledReason:
        unavailableReasonMessages[data.unavailableReason ?? "not_configured"],
    };
  }
  return {
    path: `/project/${encodeURIComponent(data.projectId)}/sessions/${encodeURIComponent(conversationId)}`,
    openDisabledReason: data.unavailableReason
      ? unavailableReasonMessages[data.unavailableReason]
      : null,
  };
}

// A disabled button, not a placeholder link, so middle-click cannot open a tab.
function disabledItem(
  item: { id: string; title: string; icon: IconComponent },
  reason: string,
): DropdownMenuItemDefinition {
  return {
    ...item,
    type: "item",
    disabled: { reason },
    onClick: () => undefined,
  };
}

function getOpenSessionItem(link: SessionLink): DropdownMenuItemDefinition {
  const item = {
    id: "open-session",
    title: "Open session in Langfuse",
    icon: ExternalLink,
  };
  if (link.path === null) {
    return disabledItem(item, link.disabledReason);
  }
  if (link.openDisabledReason) {
    return disabledItem(item, link.openDisabledReason);
  }
  return { ...item, type: "item", href: link.path, linkTarget: "_blank" };
}

/** Stays available without telemetry project access, so the link can be shared. */
function getCopySessionLinkItem(link: SessionLink): DropdownMenuItemDefinition {
  const item = {
    id: "copy-session-link",
    title: "Copy session link",
    icon: Link,
  };
  if (link.path === null) {
    return disabledItem(item, link.disabledReason);
  }
  const { path } = link;
  return {
    ...item,
    type: "item",
    onClick: () => {
      const sessionUrl = `${window.location.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
      copyTextToClipboard(sessionUrl)
        .then(() => {
          showSuccessToast({
            operation: "in_app_agent_session_link.copy",
            title: "Session link copied",
            description: sessionUrl,
            duration: 2000,
          });
        })
        .catch(() => undefined);
    },
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
  const sessionLink = resolveSessionLink({
    conversationId,
    data: telemetryProject.data,
    isError: telemetryProject.isError,
    isPending: telemetryProject.isPending,
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
              operation: "in_app_agent_session_id.copy",
              title: "Session ID copied",
              description: conversationId,
              duration: 2000,
            });
          })
          .catch(() => undefined);
      },
    },
    getCopySessionLinkItem(sessionLink),
    getOpenSessionItem(sessionLink),
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
          <MoreHorizontal size="base" color="default" />
        </Button>
      )}
    </DropdownMenu>
  );
}
