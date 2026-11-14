"use client";

import {
  Check,
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
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { type RouterOutputs } from "@/src/utils/api";

type TelemetryProjectQuery = {
  data: RouterOutputs["inAppAgent"]["telemetryProject"] | undefined;
  isError: boolean;
  isPending: boolean;
};

type SessionLink = { path: string } | { path: null; disabledReason: string };

type CopyText = (text: string) => void;

function resolveSessionLink(
  conversationId: string,
  { data, isError, isPending }: TelemetryProjectQuery,
): SessionLink {
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
        "Halo telemetry is not recorded for this organization or instance.",
    };
  }
  return {
    path: `/project/${encodeURIComponent(data.projectId)}/sessions/${encodeURIComponent(conversationId)}`,
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

function getCopySessionIdItem(
  conversationId: string,
  copy: CopyText,
): DropdownMenuItemDefinition {
  return {
    type: "item",
    id: "copy-session-id",
    title: "Copy session ID",
    icon: Copy,
    onClick: () => {
      copy(conversationId);
    },
  };
}

function getCopySessionLinkItem(
  link: SessionLink,
  copy: CopyText,
): DropdownMenuItemDefinition {
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
      copy(
        `${window.location.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`,
      );
    },
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
  return { ...item, type: "item", href: link.path, linkTarget: "_blank" };
}

/**
 * `telemetryProject` is null where assistant sessions must not be linked
 * (the HIPAA region); the menu then offers only the session ID. Copying
 * closes the menu, so the trigger briefly shows a checkmark instead.
 */
export function InAppAgentInternalSessionMenuView({
  conversationId,
  telemetryProject,
}: {
  conversationId: string;
  telemetryProject: TelemetryProjectQuery | null;
}) {
  const { copy, isCopied } = useCopyToClipboard({ successDuration: 1_500 });
  const copyText: CopyText = (text) => {
    copy(text).catch(() => undefined);
  };
  const sessionLink = telemetryProject
    ? resolveSessionLink(conversationId, telemetryProject)
    : null;
  const items: DropdownMenuItemDefinition[] = [
    getCopySessionIdItem(conversationId, copyText),
    ...(sessionLink
      ? [
          getCopySessionLinkItem(sessionLink, copyText),
          getOpenSessionItem(sessionLink),
        ]
      : []),
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
          {isCopied ? (
            <Check size="base" color="default" aria-label="Copied" />
          ) : (
            <MoreHorizontal size="base" color="default" />
          )}
        </Button>
      )}
    </DropdownMenu>
  );
}
