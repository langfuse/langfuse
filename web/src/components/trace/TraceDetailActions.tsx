import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DeleteTraceButton } from "@/src/components/deleteButton";

/**
 * Trace-level header actions (star / publish / delete) shared by the peek and
 * the standalone trace page, so both surfaces expose the same controls. Each
 * sub-component self-hides when the user lacks the relevant project scope (e.g.
 * a public trace viewed by a non-member), so this is safe to render anywhere.
 *
 * Delete behavior differs only by surface:
 * - **page**: pass `deleteRedirectUrl` → navigates to the list after delete.
 * - **peek**: pass `onAfterDelete` (e.g. `closePeek`) → closes in place; the
 *   list is invalidated so the deleted row disappears.
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
}) {
  const utils = api.useUtils();

  return (
    <div className="flex flex-row items-center gap-1">
      <StarTraceDetailsToggle
        projectId={projectId}
        traceId={traceId}
        value={bookmarked}
        size={size}
      />
      <PublishTraceSwitch
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        isPublic={isPublic}
        size={size}
      />
      <DeleteTraceButton
        itemId={traceId}
        projectId={projectId}
        redirectUrl={deleteRedirectUrl}
        invalidateFunc={() => {
          utils.traces.all.invalidate();
          onAfterDelete?.();
        }}
        deleteConfirmation={name ?? ""}
        icon
      />
    </div>
  );
}
