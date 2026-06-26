import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DeleteTraceButton } from "@/src/components/deleteButton";

/** A labeled menu row wrapping one of the icon controls (used in the peek's
 *  overflow "…" menu so folded actions read as proper labeled items). The
 *  control keeps its own behavior — Share opens its URL popover, Delete its
 *  confirm — so nothing is reimplemented. */
function ActionMenuRow({
  control,
  label,
}: {
  control: React.ReactNode;
  label: string;
}) {
  return (
    <div className="hover:bg-accent flex items-center gap-2 rounded-sm py-0.5 pr-2 pl-1">
      {control}
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * Trace-level header actions (star / publish / delete) shared by the peek and
 * the standalone trace page, so both surfaces expose the same controls. Each
 * sub-component renders DISABLED (not hidden) when the user lacks the relevant
 * project scope, matching the page's long-standing behavior.
 *
 * `layout="toolbar"` (default) is the inline icon row; `layout="menu"` renders
 * the same controls as labeled rows for the peek's overflow popover.
 *
 * Delete always targets the whole trace (same as the page, even when reached
 * from an observation/event row — the surface shows that trace). Behavior
 * differs only by surface:
 * - **page**: pass `deleteRedirectUrl` → navigates to the list after delete.
 * - **peek**: pass `onAfterDelete` (e.g. `closePeek`) → closes in place. We
 *   invalidate broadly because the peek is hosted over many different lists
 *   (traces, observations, events, sessions, experiments, datasets), each
 *   backed by a different query — so the deleted row disappears everywhere.
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
  onAfterDelete?: () => void;
  size?: "icon" | "icon-xs";
  layout?: "toolbar" | "menu";
}) {
  const utils = api.useUtils();

  const star = (
    <StarTraceDetailsToggle
      projectId={projectId}
      traceId={traceId}
      value={bookmarked}
      size={size}
    />
  );
  const publish = (
    <PublishTraceSwitch
      projectId={projectId}
      traceId={traceId}
      timestamp={timestamp}
      isPublic={isPublic}
      size={size}
    />
  );
  const del = (
    <DeleteTraceButton
      itemId={traceId}
      projectId={projectId}
      redirectUrl={deleteRedirectUrl}
      invalidateFunc={() => {
        // The page path navigates away (redirectUrl) and never calls this.
        // The peek path is hosted over many different lists, so invalidate all
        // queries to refresh whichever list is behind the peek, then close it.
        utils.invalidate();
        onAfterDelete?.();
      }}
      deleteConfirmation={name ?? ""}
      icon
      // Match Star/Publish so the three icons share one row height (the delete
      // icon branch otherwise falls back to "icon" = 32px vs 24px) and one
      // style — ghost, not the default boxed "outline-solid".
      size={size}
      variant="ghost"
    />
  );

  if (layout === "menu") {
    return (
      <div className="flex flex-col gap-0.5">
        <ActionMenuRow
          control={star}
          label={bookmarked ? "Remove bookmark" : "Bookmark"}
        />
        <ActionMenuRow control={publish} label="Share" />
        <ActionMenuRow control={del} label="Delete" />
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-1">
      {star}
      {publish}
      {del}
    </div>
  );
}
