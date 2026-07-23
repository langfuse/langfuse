import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DeleteTraceButton } from "@/src/components/deleteButton";

/**
 * Trace-level header actions (star / publish / delete) shared by the peek and
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
  bookmarked,
  isPublic,
  name,
  timestamp,
  deleteRedirectUrl,
  onAfterDelete,
  size = "icon-xs",
  layout = "toolbar",
}: {
  traceId: string;
  projectId: string;
  bookmarked: boolean;
  isPublic: boolean;
  name?: string | null;
  timestamp?: Date;
  deleteRedirectUrl?: string;
  onAfterDelete?: (deletedTraceId: string) => void;
  size?: "icon" | "icon-xs";
  layout?: "toolbar" | "menu";
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

  if (isMenu) {
    return (
      <div className="flex w-full flex-col gap-0.5">
        <StarTraceDetailsToggle
          projectId={projectId}
          traceId={traceId}
          value={bookmarked}
          showLabel
        />
        <PublishTraceSwitch
          projectId={projectId}
          traceId={traceId}
          timestamp={timestamp}
          isPublic={isPublic}
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
      {/* The star owns its tooltip (composed onto the real button, so the
          aria-describedby lands on the focusable control) and drives its label
          from the optimistic state — see StarToggle. */}
      <StarTraceDetailsToggle
        projectId={projectId}
        traceId={traceId}
        value={bookmarked}
        size={size}
        tooltip
      />
      <PublishTraceSwitch
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        isPublic={isPublic}
        size={size}
        tooltip={isPublic ? "Shared (public)" : "Share"}
      />
      <DeleteTraceButton
        itemId={traceId}
        projectId={projectId}
        redirectUrl={deleteRedirectUrl}
        invalidateFunc={onDeleteInvalidate}
        deleteConfirmation={name ?? ""}
        icon
        // Match Star/Publish so the three icons share one row height and a
        // ghost (not boxed "outline") style.
        size={size}
        variant="ghost"
      />
    </div>
  );
}
