/* eslint-disable @repo/no-null-render */
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
  const {
    truncatedAtObservations,
    detachedObservationId,
    detachedObservationIsMisplaced,
  } = useTraceData();

  // Per trace view: dismissing frees the space for this visit, and the notice is
  // back on the next trace/reload rather than silently gone for good. Stored as
  // the RANK that was dismissed, because selection moves in and out of the
  // detached row and so the message changes both ways.
  const [dismissedRank, setDismissedRank] = useState(-1);

  if (!truncatedAtObservations) return null;

  // The detached row carries no marker of its own (deliberately — a per-row label
  // is noise on every scroll), so this sentence is the ONLY place that can say
  // the tree is showing it out of position.
  const detachedNote = !detachedObservationId
    ? null
    : detachedObservationIsMisplaced
      ? " The one you opened is loaded separately, and appears at the top level because its parent is missing too."
      : " The one you opened is loaded separately.";

  // Ranked by how much the message says. Dismissing hides that message and
  // everything it already covered, but never a later one that says MORE — so
  // dismissing the short detached note cannot swallow the out-of-position
  // caveat, which is the only warning that row gets.
  const rank =
    detachedObservationId && detachedObservationIsMisplaced
      ? 2
      : detachedObservationId
        ? 1
        : 0;
  if (rank <= dismissedRank) return null;

  return (
    <div className="text-muted-foreground border-border bg-muted/40 flex shrink-0 items-start gap-2 border-b py-1.5 pr-1 pl-2 text-xs">
      <TriangleAlert className="text-foreground-tertiary mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        {/* No total: the server stops counting at the cap, so we know "more than
            this", never how many. */}
        <span className="font-bold">
          Showing the first {truncatedAtObservations.toLocaleString()}{" "}
          observations
        </span>{" "}
        by start time. Later ones are missing here — find them in the
        observations table.
        {detachedNote}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissedRank(rank)}
        className="hover:bg-muted-foreground/10 hover:text-foreground shrink-0 rounded p-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
