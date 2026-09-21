import {
  CopyIcon,
  Download,
  Globe,
  Loader2,
  MoreVertical,
  Share2,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { DeleteTraceButton } from "@/src/components/deleteButton";
import {
  PublishTraceSwitch,
  ShareObjectPanel,
  usePublishTrace,
} from "@/src/components/publish-object-switch";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useDownloadTraceAsJson } from "@/src/features/traces/hooks/useDownloadTraceAsJson";
import { type useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

/**
 * Trace-level header actions shared by the peek and the standalone trace page.
 *
 * `layout="toolbar"` (default) renders the icon row: Download JSON plus a kebab
 * holding Share, Copy trace ID, Copy trace name and Delete. `layout="menu"`
 * renders the same actions as full-width labeled rows for the peek's overflow
 * popover and the mobile header menu.
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
  const utils = api.useUtils();
  const [isShareOpen, setIsShareOpen] = useState(false);
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

  const onDeleteInvalidate = () => {
    utils.invalidate();
    onAfterDelete?.(trace.id);
  };

  const copyToClipboard = async (text: string) => {
    await copyTextToClipboard(text);
    toast.success("Copied to clipboard");
  };

  const downloadIcon = isDownloading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Download className="h-4 w-4" />
  );

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
          <span className="text-sm">Download JSON</span>
        </Button>
        <PublishTraceSwitch
          projectId={trace.projectId}
          traceId={trace.id}
          timestamp={timestamp}
          isPublic={trace.public}
          shareUrl={shareUrl}
          label="Share link"
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-normal"
          onClick={() => copyToClipboard(trace.id)}
        >
          <CopyIcon className="h-4 w-4" />
          <span className="text-sm">Copy trace ID</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-normal"
          disabled={!trace.name}
          onClick={() => copyToClipboard(trace.name ?? "")}
        >
          <CopyIcon className="h-4 w-4" />
          <span className="text-sm">Copy trace name</span>
        </Button>
        <DeleteTraceButton
          itemId={trace.id}
          projectId={trace.projectId}
          redirectUrl={deleteRedirectUrl}
          invalidateFunc={onDeleteInvalidate}
          deleteConfirmation={trace.name ?? ""}
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal"
        />
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
      <DeleteTraceButton
        itemId={trace.id}
        projectId={trace.projectId}
        redirectUrl={deleteRedirectUrl}
        invalidateFunc={onDeleteInvalidate}
        deleteConfirmation={trace.name ?? ""}
      >
        {({ openDialog, disabled }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <HeaderActionButton
                label="More actions"
                icon={<MoreVertical className="h-4 w-4" />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Popover
                open={isShareOpen}
                onOpenChange={(open) => {
                  if (!publish.isPending) setIsShareOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    disabled={!publish.hasAccess || publish.isPending}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {trace.public ? (
                      <Globe
                        className="mr-2 h-4 w-4"
                        fill="#b3d9ff"
                        stroke="#4d94ff"
                        strokeWidth={2}
                      />
                    ) : (
                      <Share2 className="mr-2 h-4 w-4" />
                    )}
                    Share link
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent>
                  <ShareObjectPanel
                    itemName="trace"
                    isPublic={trace.public}
                    shareUrl={shareUrl}
                    isLoading={publish.isPending}
                    onToggle={() => {
                      setIsShareOpen(false);
                      publish.toggle(!trace.public);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <DropdownMenuItem onClick={() => copyToClipboard(trace.id)}>
                <CopyIcon className="mr-2 h-4 w-4" />
                Copy trace ID
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!trace.name}
                onClick={() => copyToClipboard(trace.name ?? "")}
              >
                <CopyIcon className="mr-2 h-4 w-4" />
                Copy trace name
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={disabled}
                onSelect={openDialog}
                className="text-destructive focus:text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </DeleteTraceButton>
    </div>
  );
}
