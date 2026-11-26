import { formatIntervalSeconds, formatLocalIsoDate } from "@/src/utils/dates";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";

const MIN_SEGMENT_PERCENT = 0.8;

type SessionTracePiece = {
  tone: "fill" | "muted" | "idle" | "rest";
  width: number;
  trace?: {
    id: string;
    name: string | null;
    position: number;
    clock: string;
    endClock: string;
    durationLabel: string;
    index: number;
  };
  idle?: {
    fromClock: string;
    toClock: string;
    durationLabel: string;
    fromPosition: number;
    toPosition: number;
  };
};

export function layoutSessionTracePieces(
  traces: readonly {
    id: string;
    name?: string | null;
    start: number;
    end: number;
  }[],
  activeIndex: number,
): {
  pieces: SessionTracePiece[];
  startClock: string;
  endClock: string;
} {
  if (traces.length === 0) {
    return { pieces: [], startClock: "", endClock: "" };
  }
  const sessionStart = Math.min(...traces.map((trace) => trace.start));
  const sessionEnd = Math.max(...traces.map((trace) => trace.end));
  const sessionMs = Math.max(0, sessionEnd - sessionStart);
  const toPercent = (ms: number) =>
    sessionMs <= 0 ? 0 : ((ms - sessionStart) / sessionMs) * 100;
  const ordered = traces
    .map((trace, index) => ({ trace, index }))
    .toSorted((a, b) => a.trace.start - b.trace.start);
  const pieces: SessionTracePiece[] = [];
  let cursor = 0;
  ordered.forEach(({ trace, index }, position) => {
    const placed = placeTrace(trace, toPercent);
    const left = clamp(Math.max(placed.start, cursor));
    const right = clamp(Math.max(placed.end, left));
    if (left > cursor + 0.2) {
      const previous = ordered[position - 1];
      const gapSeconds =
        previous === undefined ? 0 : idleGap(previous.trace.end, trace.start);
      pieces.push({
        tone: "idle",
        width: left - cursor,
        idle:
          previous !== undefined
            ? {
                fromClock: formatTraceClock(
                  previous.trace.end,
                  sessionStart,
                  sessionEnd,
                ),
                toClock: formatTraceClock(
                  trace.start,
                  sessionStart,
                  sessionEnd,
                ),
                durationLabel: formatSessionDuration(gapSeconds),
                fromPosition: position,
                toPosition: position + 1,
              }
            : undefined,
      });
    }
    const width = Math.max(right - left, MIN_SEGMENT_PERCENT);
    pieces.push({
      tone: index === activeIndex ? "fill" : "muted",
      width,
      trace: {
        id: trace.id,
        name: trace.name?.trim() || trace.id,
        position: position + 1,
        index,
        clock: formatTraceClock(trace.start, sessionStart, sessionEnd),
        endClock: formatTraceClock(trace.end, sessionStart, sessionEnd),
        durationLabel: formatSessionDuration(
          Math.max(0, trace.end - trace.start) / 1000,
        ),
      },
    });
    cursor = Math.max(cursor, left + width);
  });
  if (cursor < 99.8) pieces.push({ tone: "idle", width: 100 - cursor });
  return {
    pieces,
    startClock: formatTraceClock(sessionStart, sessionStart, sessionEnd),
    endClock: formatTraceClock(sessionEnd, sessionStart, sessionEnd),
  };
}

function placeTrace(
  trace: { start: number; end: number },
  toPercent: (ms: number) => number,
) {
  const start = toPercent(trace.start);
  const end = toPercent(Math.max(trace.end, trace.start));
  const width = Math.min(100, Math.max(end - start, MIN_SEGMENT_PERCENT));
  const left = Math.max(0, Math.min(start, 100 - width));
  return { start: left, end: left + width };
}

function idleGap(previousEnd: number, nextStart: number) {
  return computeIdleGapSeconds(
    { timestamp: new Date(previousEnd), latencyMs: 0 },
    { timestamp: new Date(nextStart) },
  );
}

function formatTraceClock(
  startMs: number,
  sessionStart: number,
  sessionEnd: number,
) {
  const spansDays =
    new Date(sessionStart).toDateString() !==
    new Date(sessionEnd).toDateString();
  const accuracy =
    spansDays || sessionEnd - sessionStart >= 2 * 60_000 ? "minute" : "second";
  const formatted = formatLocalIsoDate(new Date(startMs), false, accuracy);
  if (spansDays) return formatted.slice(5, 16);
  return formatted.slice(11);
}

function formatSessionDuration(seconds: number) {
  if (seconds < 60) return formatIntervalSeconds(seconds, 0);
  const whole = Math.round(seconds);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
