import { api } from "@/src/utils/api";
import { MoreHorizontal } from "lucide-react";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DeleteTraceButton } from "@/src/components/deleteButton";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

/**
 * Trace-level header actions (publish / delete) shared by the peek and
 * the standalone trace page, so both surfaces expose the same controls. Each
 * sub-component renders DISABLED (not hidden) when the user lacks the relevant
 * project scope, matching the page's long-standing behavior.
 *
 * `layout="toolbar"` (default) is the inline icon row; `layout="menu"` renders
 * the same controls as full-width labeled rows for the peek's overflow popover
 * (whole row clickable) — Share keeps its URL popover, Delete its confirm.
 *
 * Delete always targets the whole trace (same as the page, even when reached
 * from an observation/event row — the surface shows that trace). Behavior
 * differs only by surface:
 * - **page**: pass `deleteRedirectUrl` → navigates to the list after delete.
 * - **peek**: pass `onAfterDelete` (e.g. `closePeek`) → closes in place. It
 *   receives the deleted trace id so the peek can stay open if K/J-navigation
 *   already moved on to another trace (LFE-10535). We invalidate broadly
 *   because the peek is hosted over many different lists (traces, observations,
 *   events, sessions, experiments, datasets), each backed by a different query
 *   — so the deleted row disappears everywhere.
 */
export function TraceDetailActions({
  traceId,
  projectId,
  isPublic,
  shareUrl,
  name,
  timestamp,
  deleteRedirectUrl,
  onAfterDelete,
  size = "icon-xs",
  layout = "toolbar",
}: {
  traceId: string;
  projectId: string;
  isPublic: boolean;
  shareUrl?: string;
  name?: string | null;
  timestamp?: Date;
  deleteRedirectUrl?: string;
  onAfterDelete?: (deletedTraceId: string) => void;
  size?: "icon" | "icon-xs";
  /**
   * - "toolbar": Share visible + delete behind a "…" popover (full page header)
   * - "menu": Share + Delete as labeled rows (mobile overflow)
   * - "share-only": just the Share switch (peek header, inline)
   * - "delete-only": just the Delete row (peek header's "…" menu)
   */
  layout?: "toolbar" | "menu" | "share-only" | "delete-only";
}) {
  const utils = api.useUtils();
  const isMenu = layout === "menu";

  // The page path navigates away (redirectUrl) and never calls this. The peek
  // path is hosted over many different lists, so invalidate all queries to
  // refresh whichever list is behind the peek, then close it. We hand the
  // deleted trace id to onAfterDelete so the peek can skip closing when it has
  // already navigated to a different trace (LFE-10535).
  const onDeleteInvalidate = () => {
    utils.invalidate();
    onAfterDelete?.(traceId);
  };

  if (layout === "share-only") {
    return (
      <PublishTraceSwitch
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        isPublic={isPublic}
        shareUrl={shareUrl}
        size={size}
        tooltip={isPublic ? "Shared (public)" : "Share"}
      />
    );
  }

  if (layout === "delete-only") {
    return (
      <DeleteTraceButton
        itemId={traceId}
        projectId={projectId}
        redirectUrl={deleteRedirectUrl}
        invalidateFunc={onDeleteInvalidate}
        deleteConfirmation={name ?? ""}
        variant="ghost"
        size="sm"
        className="w-full justify-start font-normal"
      />
    );
  }

  if (isMenu) {
    return (
      <div className="flex w-full flex-col gap-0.5">
        <PublishTraceSwitch
          projectId={projectId}
          traceId={traceId}
          timestamp={timestamp}
          isPublic={isPublic}
          shareUrl={shareUrl}
          label="Share"
        />
        <DeleteTraceButton
          itemId={traceId}
          projectId={projectId}
          redirectUrl={deleteRedirectUrl}
          invalidateFunc={onDeleteInvalidate}
          deleteConfirmation={name ?? ""}
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-1">
      <PublishTraceSwitch
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        isPublic={isPublic}
        shareUrl={shareUrl}
        size={size}
        tooltip={isPublic ? "Shared (public)" : "Share"}
      />
      {/* Delete is low-traffic (~100 users/30d) and destructive — folded
          behind an overflow trigger instead of a bare trash icon in the
          toolbar. forceMount + hide-when-closed: DeleteTraceButton hosts its
          own confirm dialog, which a default Popover would unmount mid-flow. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size={size}
            title="More actions"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          forceMount
          className="flex w-auto min-w-36 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
        >
          <DeleteTraceButton
            itemId={traceId}
            projectId={projectId}
            redirectUrl={deleteRedirectUrl}
            invalidateFunc={onDeleteInvalidate}
            deleteConfirmation={name ?? ""}
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
