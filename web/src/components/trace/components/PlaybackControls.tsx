/**
 * PlaybackControls - transport for the trace playhead, in the navigation
 * header. The play/pause button is wrapped in a circular progress ring that
 * fills as the playhead sweeps the trace's total time — a compact "where are
 * we in the trace" indicator that isn't tied to the gantt. Stop resets it.
 *
 * Shown only when there is something to WATCH play: the timeline view (the
 * sweeping playhead) or a visible graph panel (the node glow). In the default
 * tree view without a graph the transport is hidden — the row glow alone
 * isn't a playback surface — but it never disappears while a playhead is
 * actively placed, so an in-flight playback keeps its controls across view
 * switches.
 *
 * The ring is driven imperatively off the playhead position feed, so it
 * animates at 60fps without re-rendering (only the play/pause icon flips, via
 * the isPlaying selector).
 */

import { useEffect, useRef } from "react";
import { Pause, Play, Square } from "lucide-react";
import { StringParam, useQueryParam } from "use-query-params";
import { Button } from "@/src/components/ui/button";
import {
  usePlayhead,
  useIsPlaying,
  useShowPlayhead,
} from "../contexts/PlayheadContext";
import { useTraceData } from "../contexts/TraceDataContext";
import { useTraceGraphData } from "../contexts/TraceGraphDataContext";
import { useSearch } from "../contexts/SearchContext";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";

// A 22px ring around the ~28px (h-7) button; 2px stroke reads at this size.
const RING_SIZE = 22;
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export function PlaybackControls() {
  const { traceDuration } = useTraceData();
  const { isGraphViewAvailable, isLoading: isGraphDataLoading } =
    useTraceGraphData();
  const { showGraph } = useViewPreferences();
  const { searchQuery } = useSearch();
  const [viewMode] = useQueryParam("view", StringParam);
  const { play, pause, stop, getPlayheadSec, subscribePosition } =
    usePlayhead();
  const isPlaying = useIsPlaying();
  const showPlayhead = useShowPlayhead();
  const ringRef = useRef<SVGCircleElement>(null);

  // Fill the ring to the current playhead fraction; update imperatively as the
  // playhead moves (no re-render). dashoffset goes C → 0 as progress 0 → 1.
  useEffect(() => {
    const apply = (sec: number) => {
      const frac = traceDuration > 0 ? Math.min(1, sec / traceDuration) : 0;
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(RING_C * (1 - frac));
      }
    };
    apply(getPlayheadSec());
    return subscribePosition(apply);
  }, [traceDuration, getPlayheadSec, subscribePosition]);

  // A playback surface exists in the timeline view (unless a search query has
  // replaced it with the search list) or when the graph panel renders — a
  // COLLAPSED panel still counts (the surface is one click away; hiding the
  // transport when the user collapses the panel would make it undiscoverable),
  // and a pending graph query counts too, so graph-eligible traces don't get a
  // transport pop-in after first load. An actively-placed playhead keeps its
  // controls regardless.
  const isSearching = searchQuery.trim().length > 0;
  const hasPlaybackSurface =
    (viewMode === "timeline" && !isSearching) ||
    (showGraph && (isGraphViewAvailable || isGraphDataLoading));
  if (traceDuration <= 0 || (!hasPlaybackSurface && !showPlayhead)) {
    return null;
  }

  return (
    <div className="ml-1 flex shrink-0 flex-row items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={isPlaying ? pause : play}
        title={isPlaying ? "Pause playback" : "Play trace over time"}
        aria-label={isPlaying ? "Pause playback" : "Play trace over time"}
        className="relative h-7 w-7"
      >
        <svg
          className="pointer-events-none absolute inset-0 m-auto"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-muted-foreground/25"
          />
          <circle
            ref={ringRef}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className="stroke-primary-accent"
          />
        </svg>
        {isPlaying ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3 translate-x-px" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={stop}
        title="Stop playback"
        aria-label="Stop playback"
        className="h-7 w-7"
      >
        <Square className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
}
