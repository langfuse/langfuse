import { Globe, Link, Share2 } from "lucide-react";

import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  getShareUrl,
  usePublishObject,
} from "@/src/components/publish-object-switch";
import { showSuccessToast } from "@/src/features/notifications";
import { copyTextToClipboard } from "@/src/utils/clipboard";

/**
 * Share menu items for a trace or session detail header: Share while private,
 * Copy share link + Unshare while public. Sharing shows a toast with a copy action.
 */
export function useShareMenuItems({
  kind,
  projectId,
  objectId,
  isPublic,
  shareUrl,
  timestamp,
}: {
  kind: "trace" | "session";
  projectId: string;
  objectId: string;
  isPublic: boolean;
  shareUrl?: string;
  timestamp?: Date;
}): DropdownMenuItemDefinition[] {
  const publish = usePublishObject({ kind, projectId, objectId, timestamp });
  const label = kind === "trace" ? "Trace" : "Session";

  let disabled: { reason: string } | undefined;
  if (!publish.hasAccess) {
    disabled = { reason: `You don't have permission to share this ${kind}.` };
  } else if (publish.isPending) {
    disabled = { reason: "Updating sharing status." };
  }

  const toggle = (nextPublic: boolean) => {
    publish
      .toggle(nextPublic)
      .then(() => {
        if (!nextPublic) return;
        showSuccessToast({
          title: `${label} is now public`,
          description: `Anyone with the link can view this ${kind}.`,
          action: {
            label: "Copy link",
            onClick: () => copyTextToClipboard(getShareUrl(shareUrl)),
          },
        });
      })
      .catch(() => undefined);
  };

  if (isPublic) {
    return [
      {
        type: "item",
        id: "copy-share-link",
        title: "Copy share link",
        icon: Link,
        onClick: () => {
          copyTextToClipboard(getShareUrl(shareUrl));
        },
      },
      {
        type: "item",
        id: "unshare",
        title: "Unshare",
        icon: Globe,
        disabled,
        onClick: () => toggle(false),
      },
    ];
  }

  return [
    {
      type: "item",
      id: "share",
      title: "Share",
      icon: Share2,
      disabled,
      onClick: () => toggle(true),
    },
  ];
}
