/* eslint-disable @repo/no-null-render */
/**
 * PlaybackControls - transport for the trace playhead. The play/pause button
 * is wrapped in a circular progress ring that fills as the playhead sweeps the
 * trace's total time — a compact "where are we in the trace" indicator. Stop
 * resets it.
 *
 * Mounted only inside the graph view's mode bar (the node glow is the one
 * playback surface with controls); the timeline keeps its playhead and
 * scrubbing but carries no transport buttons.
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
} from "@/src/features/traces/contexts/PlayheadContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";

// A 22px ring around the ~28px (h-7) button; 2px stroke reads at this size.
const RING_SIZE = 22;
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Whether there is anything to play: the transport mounts only inside the
 * graph view's chrome (its one playback surface), so the only remaining guard
 * is a trace with actual duration.
 */
function useHasPlayback(): boolean {
  const { traceDuration } = useTraceData();
  return traceDuration > 0;
}

/**
 * Play/pause/stop click handlers. Capture at this click seam (not the store's
 * play/pause/stop): auto-pause at end-of-trace must not look like a user stop,
 * and a programmatic reset must not inflate usage.
 */
function usePlaybackClickHandlers() {
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const { observations } = useTraceData();
  const [viewMode] = useQueryParam("view", StringParam);
  const { play, pause, stop } = usePlayhead();
  const isPlaying = useIsPlaying();
  const showPlayhead = useShowPlayhead();

  // Tree is stored as a null query param; anything else is still tree.
  const props = {
    viewMode:
      viewMode === "timeline"
        ? ("timeline" as const)
        : viewMode === "graph"
          ? ("graph" as const)
          : ("tree" as const),
    observationCount: observations.length,
    ...analyticsDimensions,
  };

  return {
    isPlaying,
    showPlayhead,
    handlePlayPause: () => {
      if (isPlaying) {
        capture("trace_detail:playback_pause", props);
        pause();
      } else {
        capture("trace_detail:playback_play", props);
        play();
      }
    },
    handleStop: () => {
      // Menu already disables Stop until a playhead exists; the header
      // button must do the same or idle clicks inflate playback_stop.
      if (!showPlayhead) return;
      capture("trace_detail:playback_stop", props);
      stop();
    },
  };
}

export function PlaybackControls() {
  const { traceDuration } = useTraceData();
  const { getPlayheadSec, subscribePosition } = usePlayhead();
  const hasPlayback = useHasPlayback();
  const { isPlaying, showPlayhead, handlePlayPause, handleStop } =
    usePlaybackClickHandlers();
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

  if (!hasPlayback) return null;

  return (
    <div className="flex shrink-0 flex-row items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handlePlayPause}
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
        onClick={handleStop}
        disabled={!showPlayhead}
        title="Stop playback"
        aria-label="Stop playback"
        className="h-7 w-7"
      >
        <Square className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
}
