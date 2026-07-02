/**
 * PlaybackControls - view-agnostic transport for the trace playhead.
 *
 * Lives in the navigation header (shown in Tree AND Timeline views). The
 * play/pause button is wrapped in a circular progress ring that fills as the
 * playhead sweeps the trace's total time — a compact "where are we in the
 * trace" indicator that isn't tied to the gantt. Stop resets it.
 *
 * The ring is driven imperatively off the playhead position pub/sub, so it
 * animates at 60fps without re-rendering (only the play/pause icon flips, via
 * the isPlaying store).
 */

import { useEffect, useRef } from "react";
import { Pause, Play, Square } from "lucide-react";
import { usePlayhead, useIsPlaying } from "../contexts/PlayheadContext";

// A 22px ring around the ~28px (h-7) button; 2px stroke reads at this size.
const RING_SIZE = 22;
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export function PlaybackControls() {
  const {
    hasTimeline,
    traceDuration,
    play,
    pause,
    stop,
    getPlayheadSec,
    subscribePosition,
  } = usePlayhead();
  const isPlaying = useIsPlaying();
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

  if (!hasTimeline) return null;

  return (
    <div className="ml-1 flex shrink-0 flex-row items-center gap-0.5">
      <button
        type="button"
        onClick={isPlaying ? pause : play}
        title={isPlaying ? "Pause playback" : "Play trace over time"}
        aria-label={isPlaying ? "Pause playback" : "Play trace over time"}
        className="hover:bg-muted text-muted-foreground hover:text-foreground relative flex h-7 w-7 items-center justify-center rounded"
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
      </button>
      <button
        type="button"
        onClick={stop}
        title="Stop playback"
        aria-label="Stop playback"
        className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded"
      >
        <Square className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
