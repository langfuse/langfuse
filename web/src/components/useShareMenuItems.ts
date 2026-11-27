import { Globe, Link, Share2 } from "@langfuse/icons";

import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  getShareUrl,
  usePublishObject,
} from "@/src/components/usePublishObject";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { copyTextToClipboard } from "@/src/utils/clipboard";

/**
 * Publish menu items for a trace or session detail header: Make Public while
 * private, Copy share link + Unshare while public. Publishing copies the link
 * and toasts. While sharing is disabled for the org or instance, a stored
 * public flag grants no access: Make Public is disabled, and a public object
 * offers only Unshare, so members can clear the flag before sharing is
 * turned back on.
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
    // Clipboard writes must happen inside the click; copy before the request.
    if (nextPublic) copyTextToClipboard(getShareUrl(shareUrl));
    publish
      .toggle(nextPublic)
      .then(() => {
        if (!nextPublic) return;
        showSuccessToast({
          operation: "sharing.enable",
          title: `${label} shared publicly`,
          description:
            "Anyone with the link can view it. Link copied to clipboard.",
        });
      })
      .catch(() => undefined);
  };

  if (isPublic) {
    const unshare: DropdownMenuItemDefinition = {
      type: "item",
      id: "unshare",
      title: "Unshare",
      icon: Globe,
      disabled,
      onClick: () => toggle(false),
    };
    if (publish.sharingDisabledReason) return [unshare];
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
      unshare,
    ];
  }

  return [
    {
      type: "item",
      id: "share",
      title: "Make Public",
      icon: Share2,
      disabled: publish.sharingDisabledReason
        ? { reason: publish.sharingDisabledReason }
        : disabled,
      onClick: () => toggle(true),
    },
  ];
}
