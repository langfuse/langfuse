import {
  Download,
  Globe,
  Link,
  Loader2,
  MoreVertical,
  Share2,
  TrashIcon,
} from "lucide-react";

import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  getShareUrl,
  usePublishTrace,
} from "@/src/components/publish-object-switch";
import { Button } from "@/src/components/ui/button";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { DeleteTraceDialogController } from "@/src/features/traces/components/DeleteTraceDialogController";
import { useDownloadTraceAsJson } from "@/src/features/traces/hooks/useDownloadTraceAsJson";
import { type useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { cn } from "@/src/utils/tailwind";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

type MenuItem = Extract<DropdownMenuItemDefinition, { type: "item" }>;

const isMenuItem = (item: DropdownMenuItemDefinition): item is MenuItem =>
  item.type === "item";

/**
 * Trace-level header actions shared by the peek and the standalone trace page.
 *
 * `layout="toolbar"` (default) renders the icon row: Download JSON plus a kebab
 * holding Share, Copy trace ID, Copy trace name and Delete. `layout="menu"`
 * renders the same actions as full-width labeled rows for the mobile header
 * menu.
 *
 * Delete always targets the whole trace. Behavior differs only by surface:
 * - **page**: pass `deleteRedirectUrl` → navigates to the list after delete.
 * - **peek**: pass `onAfterDelete` (e.g. `closePeek`) → closes in place. It
 *   receives the deleted trace id so the peek can stay open if K/J-navigation
 *   already moved on to another trace. We invalidate broadly because the peek
 *   is hosted over many different lists, each backed by a different query.
 */
export function TraceDetailActions({
  trace,
  traceContext,
  shareUrl,
  timestamp,
  deleteRedirectUrl,
  onAfterDelete,
  layout = "toolbar",
}: {
  trace: TraceDetailData;
  traceContext: "fullscreen" | "peek";
  shareUrl?: string;
  timestamp?: Date;
  deleteRedirectUrl?: string;
  onAfterDelete?: (deletedTraceId: string) => void;
  layout?: "toolbar" | "menu";
}) {
  const publish = usePublishTrace({
    traceId: trace.id,
    projectId: trace.projectId,
    timestamp,
  });
  const [handleDownload, isDownloading] = useDownloadTraceAsJson({
    trace,
    observations: trace.observations,
    traceContext,
  });

  let shareDisabled: { reason: string } | undefined;
  if (!publish.hasAccess) {
    shareDisabled = {
      reason: "You don't have permission to share this trace.",
    };
  } else if (publish.isPending) {
    shareDisabled = { reason: "Updating sharing status." };
  }

  const shareItems: DropdownMenuItemDefinition[] = trace.public
    ? [
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
          title: "Unshare (make private)",
          icon: Globe,
          disabled: shareDisabled,
          onClick: () => {
            publish.toggle(false).catch(() => undefined);
          },
        },
      ]
    : [
        {
          type: "item",
          id: "share",
          title: "Share (make public)",
          icon: Share2,
          disabled: shareDisabled,
          onClick: () => {
            publish.toggle(true).catch(() => undefined);
          },
        },
      ];

  const idItems = [
    { id: trace.id, name: "trace ID" },
    ...(trace.name ? [{ id: trace.name, name: "trace name" }] : []),
  ];

  const downloadIcon = isDownloading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Download className="h-4 w-4" />
  );

  return (
    <DeleteTraceDialogController
      projectId={trace.projectId}
      traceId={trace.id}
      traceName={trace.name}
      redirectUrl={deleteRedirectUrl}
      onAfterDelete={onAfterDelete}
    >
      {({ disabled: deleteDisabled, openDialog: openDeleteDialog }) => (
        <ConnectedDetailHeaderActionsMenuController
          idItems={idItems}
          projectId={trace.projectId}
          renderMenu={(copyItems) => {
            const items: DropdownMenuItemDefinition[] = [
              ...shareItems,
              ...copyItems,
              { id: "delete-separator", type: "separator" },
              {
                type: "item",
                id: "delete",
                title: "Delete",
                icon: TrashIcon,
                variant: "destructive",
                disabled: deleteDisabled,
                onClick: openDeleteDialog,
              },
            ];

            if (layout === "menu") {
              return (
                <div className="flex w-full flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 font-normal"
                    disabled={isDownloading}
                    onClick={() => handleDownload()}
                  >
                    {downloadIcon}
                    Download JSON
                  </Button>
                  {items.filter(isMenuItem).map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.id}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start gap-2 font-normal",
                          item.variant === "destructive" &&
                            "text-destructive hover:text-destructive",
                        )}
                        disabled={item.disabled !== undefined}
                        title={item.disabled?.reason}
                        onClick={item.onClick}
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        {item.title}
                      </Button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="flex flex-row items-center gap-1">
                <HeaderActionButton
                  label="Download JSON"
                  icon={downloadIcon}
                  disabled={isDownloading}
                  onClick={() => handleDownload()}
                />
                <DropdownMenu items={items} placement="bottom-end">
                  {({ getTriggerProps }) => (
                    <HeaderActionButton
                      label="More actions"
                      icon={<MoreVertical className="h-4 w-4" />}
                      {...getTriggerProps()}
                    />
                  )}
                </DropdownMenu>
              </div>
            );
          }}
        />
      )}
    </DeleteTraceDialogController>
  );
}
