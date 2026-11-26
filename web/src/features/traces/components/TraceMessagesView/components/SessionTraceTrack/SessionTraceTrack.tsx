import { useLayoutEffect, useRef, useState } from "react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import { layoutSessionTracePieces } from "./fns/layoutSessionTracePieces";

type SessionTracePiece = ReturnType<typeof layoutSessionTracePieces>[number];
import { tracesFitHitTarget } from "./fns/tracesFitHitTarget";

const pieceClassName = {
  fill: "bg-accent-dark-blue",
  muted: "bg-accent-dark-blue/40",
  idle: "bg-muted-foreground/25",
  rest: "bg-muted",
} as const;

export type SessionTraceTrackTrace = {
  id: string;
  name?: string | null;
  start: number;
  end: number;
};

export function SessionTraceTrack({
  traces,
  activeIndex,
  onSelect,
  clicksDisabled = false,
}: {
  traces: readonly SessionTraceTrackTrace[];
  activeIndex: number;
  onSelect?: (index: number) => void;
  clicksDisabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(trackRef);
  const pieces = layoutSessionTracePieces(traces, activeIndex);
  const tracePieces = pieces.filter((piece) => piece.trace);
  const clickable =
    !clicksDisabled &&
    Boolean(onSelect) &&
    tracesFitHitTarget(
      pieces.map((piece) => piece.width),
      tracePieces.map((piece) => piece.width),
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
        const trace = piece.trace;
        const interactive = clickable && trace && onSelect;
        return (
          <span
            key={trace ? trace.id : `${piece.tone}-${index}`}
            className="contents"
          >
            {interactive ? (
              <TraceSegmentButton
                piece={piece}
                total={traces.length}
                onSelect={() => onSelect(trace.index)}
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
  piece: SessionTracePiece;
  total: number;
  onSelect: () => void;
}) {
  const trace = piece.trace;
  const label = `Go to trace ${trace?.position} of ${total}, ${trace?.clock}`;
  return (
    <CustomTooltip
      content={
        <span className="ph-no-capture whitespace-pre-line">
          {`${trace?.name}\n${trace?.clock} · ${trace?.durationLabel}`}
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

function segmentClassName(tone: SessionTracePiece["tone"], clickable: boolean) {
  if (tone === "muted" && !clickable) return "bg-muted";
  return pieceClassName[tone];
}

function separate(current: SessionTracePiece, next: SessionTracePiece) {
  if (current.tone === "fill" || next.tone === "fill") return true;
  return current.width >= 3 && next.width >= 3;
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
