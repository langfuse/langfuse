/**
 * Inline notice above the tree/timeline/search list when the trace has more
 * observations than the detail view loads.
 *
 * It sits in the navigation pane on purpose: the missing observations are a fact
 * about the picture drawn there, not an error that happened. It also renders in
 * the peek, which previously said nothing at all about truncation.
 *
 * The count comes from the server response, never a client copy of the cap — the
 * limit is server-owned and can change without this file.
 */

import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";

export function TraceTruncationNotice() {
  const { truncatedAtObservations, detachedObservationId } = useTraceData();

  if (!truncatedAtObservations) return null;

  return (
    <DismissableNotice
      // Remount (and so un-dismiss) when the message gains its detached-row
      // sentence: that is new information, not the notice nagging again.
      key={detachedObservationId ? "with-detached" : "plain"}
      loadedObservationCount={truncatedAtObservations}
      hasDetachedObservation={!!detachedObservationId}
    />
  );
}

function DismissableNotice({
  loadedObservationCount,
  hasDetachedObservation,
}: {
  loadedObservationCount: number;
  hasDetachedObservation: boolean;
}) {
  // Per trace view: dismissing frees the space for this visit, and the notice is
  // back on the next trace/reload rather than silently gone for good.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="text-muted-foreground border-border bg-muted/40 flex shrink-0 items-start gap-2 border-b py-1.5 pr-1 pl-2 text-xs">
      <TriangleAlert className="text-foreground-tertiary mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        {/* No total: the server stops counting at the cap, so we know "more than
            this", never how many. */}
        <span className="font-bold">
          Showing the first {loadedObservationCount.toLocaleString()}{" "}
          observations
        </span>{" "}
        by start time. Later ones are missing here — find them in the
        observations table.
        {hasDetachedObservation
          ? " The one you opened is loaded separately, marked below."
          : null}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="hover:bg-muted-foreground/10 hover:text-foreground shrink-0 rounded p-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
