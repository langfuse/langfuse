import { useLayoutEffect, useRef, useState } from "react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import {
  tracesFitHitTarget,
  type SessionTraceProgressSegment,
} from "./sessionTraceProgress";

const pieceClassName = {
  fill: "bg-accent-dark-blue",
  muted: "bg-accent-dark-blue/40",
  idle: "bg-muted-foreground/25",
  rest: "bg-muted",
} as const;

type Piece = {
  tone: keyof typeof pieceClassName;
  width: number;
  segment?: SessionTraceProgressSegment;
};

export function SessionTraceTrack({
  segments,
  total,
  onSelectTrace,
}: {
  segments: readonly SessionTraceProgressSegment[];
  total: number;
  onSelectTrace?: (traceId: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(trackRef);
  const pieces = layoutPieces(segments);
  const traceWidths = pieces
    .filter((piece) => piece.segment?.traceId)
    .map((piece) => piece.width);
  const clickable =
    Boolean(onSelectTrace) &&
    tracesFitHitTarget(
      pieces.map((piece) => piece.width),
      traceWidths,
      width,
    );

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label="Session timeline"
      className="flex h-2 min-w-6 flex-1 overflow-hidden rounded-full"
    >
      {pieces.map((piece, index) => {
        const next = pieces[index + 1];
        const traceId = piece.segment?.traceId;
        const interactive = clickable && traceId && onSelectTrace;
        return (
          <span key={traceId ?? `${piece.tone}-${index}`} className="contents">
            {interactive ? (
              <TraceSegmentButton
                piece={piece}
                total={total}
                onSelect={() => onSelectTrace(traceId)}
              />
            ) : (
              <span
                className={cn(
                  "h-full min-w-0",
                  segmentClassName(piece.tone, clickable),
                  piece.tone === "fill" && "min-w-1",
                )}
                data-active={piece.tone === "fill" ? "" : undefined}
                style={{ flexGrow: piece.width, flexBasis: 0 }}
              />
            )}
            {next && separate(piece, next) ? (
              <span className="bg-background w-0.5 shrink-0" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function TraceSegmentButton({
  piece,
  total,
  onSelect,
}: {
  piece: Piece;
  total: number;
  onSelect: () => void;
}) {
  const segment = piece.segment;
  const name = segment?.name?.trim() || segment?.traceId;
  const label = `Go to trace ${segment?.position} of ${total}, ${segment?.clock}`;
  return (
    <CustomTooltip
      content={
        <span className="ph-no-capture whitespace-pre-line">
          {`${name}\n${segment?.clock} · ${segment?.durationLabel}`}
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          aria-label={label}
          className={cn(
            "ph-no-capture h-full min-w-0 cursor-pointer",
            piece.tone === "fill"
              ? "bg-accent-dark-blue hover:brightness-110 min-w-1"
              : "bg-accent-dark-blue/40 hover:bg-accent-dark-blue/70",
          )}
          data-active={piece.tone === "fill" ? "" : undefined}
          style={{ flexGrow: piece.width, flexBasis: 0 }}
          onClick={onSelect}
          {...getTriggerProps()}
        />
      )}
    </CustomTooltip>
  );
}

function segmentClassName(tone: Piece["tone"], clickable: boolean) {
  if (tone === "muted" && !clickable) return "bg-muted";
  return pieceClassName[tone];
}

function layoutPieces(
  segments: readonly SessionTraceProgressSegment[],
): Piece[] {
  const traces = segments
    .filter((segment) => segment.traceId)
    .toSorted((a, b) => a.start - b.start);
  const idles = segments.filter((segment) => segment.tone === "idle");
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const trace of traces) {
    const left = clamp(Math.max(trace.start, cursor));
    const right = clamp(Math.max(trace.end, left));
    if (left > cursor + 0.2) {
      const idle = idles.some(
        (segment) => segment.start < left && segment.end > cursor + 0.2,
      );
      pieces.push({ tone: idle ? "idle" : "rest", width: left - cursor });
    }
    const width = Math.max(right - left, trace.tone === "fill" ? 0.8 : 0);
    if (width > 0) pieces.push({ tone: trace.tone, width, segment: trace });
    cursor = Math.max(cursor, left + width);
  }
  if (cursor < 99.8) pieces.push({ tone: "rest", width: 100 - cursor });
  return pieces;
}

function separate(current: Piece, next: Piece) {
  if (current.tone === "fill" || next.tone === "fill") return true;
  return current.width >= 3 && next.width >= 3;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

function useElementWidth(ref: { current: HTMLElement | null }) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
