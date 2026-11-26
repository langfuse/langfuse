import { formatIntervalSeconds, formatLocalIsoDate } from "@/src/utils/dates";
import {
  computeIdleGapSeconds,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/features/sessions/sessionIdleGap";

export type SessionTraceSpan = {
  id: string;
  startMs: number;
  endMs: number;
};

export type SessionTraceProgressSegment = {
  start: number;
  end: number;
  tone: "fill" | "muted" | "idle";
};

const MIN_SEGMENT_PERCENT = 0.8;

export function buildSessionTraceProgress(
  spans: readonly SessionTraceSpan[],
  currentId: string,
) {
  const current = spans.find((span) => span.id === currentId);
  if (!current || spans.length === 0) return null;
  const sessionStart = Math.min(...spans.map((span) => span.startMs));
  const sessionEnd = Math.max(...spans.map((span) => span.endMs));
  const sessionMs = Math.max(0, sessionEnd - sessionStart);
  const toPercent = (ms: number) =>
    sessionMs <= 0 ? 0 : ((ms - sessionStart) / sessionMs) * 100;
  const ordered = spans.toSorted((a, b) => a.startMs - b.startMs);
  const segments: SessionTraceProgressSegment[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    // End is already included in endMs, so latency stays 0.
    const gapSeconds = computeIdleGapSeconds(
      { timestamp: new Date(previous.endMs), latencyMs: 0 },
      { timestamp: new Date(next.startMs) },
    );
    if (gapSeconds < IDLE_GAP_THRESHOLD_SECONDS) continue;
    segments.push({
      start: toPercent(previous.endMs),
      end: toPercent(next.startMs),
      tone: "idle",
    });
  }
  for (const span of ordered) {
    if (span.id === currentId) continue;
    segments.push(spanSegment(span, toPercent, "muted"));
  }
  segments.push(spanSegment(current, toPercent, "fill"));
  const offsetSeconds = Math.max(0, (current.startMs - sessionStart) / 1000);
  const totalSeconds = sessionMs / 1000;
  const clock = formatLocalIsoDate(
    new Date(current.startMs),
    false,
    "second",
  ).slice(11);
  return {
    label: clock,
    valueText: `${formatSessionDuration(offsetSeconds)} / ${formatSessionDuration(totalSeconds)}`,
    value: Math.min(100, Math.max(0, toPercent(current.startMs))),
    segments,
  };
}

function spanSegment(
  span: SessionTraceSpan,
  toPercent: (ms: number) => number,
  tone: "fill" | "muted",
): SessionTraceProgressSegment {
  const start = toPercent(span.startMs);
  const end = toPercent(Math.max(span.endMs, span.startMs));
  const width = Math.min(100, Math.max(end - start, MIN_SEGMENT_PERCENT));
  const left = Math.max(0, Math.min(start, 100 - width));
  return { start: left, end: left + width, tone };
}

/** Hour and minute units from formatIntervalSeconds, without trailing zero seconds. */
function formatSessionDuration(seconds: number) {
  if (seconds < 60) return formatIntervalSeconds(seconds, 0);
  const whole = Math.round(seconds);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}
