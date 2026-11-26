import { useLayoutEffect, useRef, useState } from "react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import { layoutSessionTracePieces } from "./fns/layoutSessionTracePieces";
import { tracesFitHitTarget } from "./fns/tracesFitHitTarget";

type SessionTracePiece = ReturnType<
  typeof layoutSessionTracePieces
>["pieces"][number];

const pieceClassName = {
  fill: "bg-observation-trace-line",
  muted: "bg-muted-foreground/60",
  idle: "bg-[repeating-linear-gradient(135deg,hsl(var(--muted-foreground)/0.55)_0_1.5px,transparent_1.5px_4px)]",
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
  const layout = layoutSessionTracePieces(traces, activeIndex);
  const pieces = layout.pieces;
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
      className="relative flex h-6 min-w-6 flex-1 overflow-hidden rounded-sm"
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
            {renderPiece(piece, interactive, traces.length, onSelect)}
            {next && separate(piece, next) ? (
              <span className="bg-background w-0.5 shrink-0" />
            ) : null}
          </span>
        );
      })}
      <TrackTimes
        startClock={layout.startClock}
        endClock={layout.endClock}
        active={pieces.find((piece) => piece.tone === "fill")?.trace}
        edgeTone={{
          start: pieces[0]?.tone,
          end: pieces[pieces.length - 1]?.tone,
        }}
      />
    </div>
  );
}

function TrackTimes({
  startClock,
  endClock,
  active,
  edgeTone,
}: {
  startClock: string;
  endClock: string;
  active?: SessionTracePiece["trace"];
  edgeTone: {
    start?: SessionTracePiece["tone"];
    end?: SessionTracePiece["tone"];
  };
}) {
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState({
    start: true,
    end: true,
    active: "range" as "range" | "start" | "none",
    center: 0,
  });
  const range =
    active && active.clock !== active.endClock
      ? `${active.clock}–${active.endClock}`
      : active?.clock;
  const activeText = visible.active === "range" ? range : active?.clock;

  useLayoutEffect(() => {
    const track = startRef.current?.parentElement?.parentElement;
    const activeSegment = track?.querySelector("[data-active]");
    if (!track || !(activeSegment instanceof HTMLElement)) return;
    const trackBox = track.getBoundingClientRect();
    const segmentBox = activeSegment.getBoundingClientRect();
    const startBox = startRef.current?.getBoundingClientRect();
    const endBox = endRef.current?.getBoundingClientRect();
    const activeBox = activeRef.current?.getBoundingClientRect();
    const activeWidth = activeBox?.width ?? 0;
    let nextActive = visible.active;
    if (activeWidth > segmentBox.width - 4) {
      nextActive = visible.active === "range" ? "start" : "none";
    }
    const center = segmentBox.left - trackBox.left + segmentBox.width / 2;
    const activeLeft = segmentBox.left + segmentBox.width / 2 - activeWidth / 2;
    const activeRight = activeLeft + activeWidth;
    const edgesCollide = Boolean(
      startBox && endBox && startBox.right + 4 > endBox.left,
    );
    const next = {
      start: Boolean(
        startBox && startBox.right < activeLeft - 4 && !edgesCollide,
      ),
      end: Boolean(endBox && endBox.left > activeRight + 4 && !edgesCollide),
      active: nextActive,
      center,
    };
    setVisible((current) =>
      current.start === next.start &&
      current.end === next.end &&
      current.active === next.active &&
      Math.abs(current.center - next.center) < 0.5
        ? current
        : next,
    );
  }, [startClock, endClock, range, activeText, visible.active]);

  const edgeClass = (tone?: SessionTracePiece["tone"]) =>
    tone === "fill" ? "text-background" : "text-muted-foreground";

  return (
    <div className="pointer-events-none absolute inset-0 text-[10px] leading-none tabular-nums">
      <span
        ref={startRef}
        className={cn(
          "ph-no-capture absolute top-1/2 left-1 -translate-y-1/2",
          edgeClass(edgeTone.start),
          !visible.start && "invisible",
        )}
      >
        {startClock}
      </span>
      <span
        ref={endRef}
        className={cn(
          "ph-no-capture absolute top-1/2 right-1 -translate-y-1/2",
          edgeClass(edgeTone.end),
          !visible.end && "invisible",
        )}
      >
        {endClock}
      </span>
      {active ? (
        <span
          ref={activeRef}
          className={cn(
            "text-background ph-no-capture absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
            visible.active === "none" && "invisible",
          )}
          style={{ left: visible.center }}
        >
          {activeText}
        </span>
      ) : null}
    </div>
  );
}

function renderPiece(
  piece: SessionTracePiece,
  interactive: boolean,
  total: number,
  onSelect?: (index: number) => void,
) {
  const trace = piece.trace;
  if (interactive && trace && onSelect) {
    return (
      <TraceSegmentButton
        piece={piece}
        total={total}
        onSelect={() => onSelect(trace.index)}
      />
    );
  }
  if (piece.idle) return <IdleGap piece={piece} />;
  return (
    <span
      className={cn(
        "h-full min-w-0",
        pieceClassName[piece.tone],
        piece.tone === "fill" && "min-w-1",
      )}
      data-active={piece.tone === "fill" ? "" : undefined}
      style={{ flexGrow: piece.width, flexBasis: 0 }}
    />
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
        <TooltipLines
          title={`Trace ${trace?.position} of ${total} · ${trace?.name}`}
          rows={[
            ["Started", trace?.clock],
            ["Duration", trace?.durationLabel],
          ]}
        />
      }
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          aria-label={label}
          className={cn(
            "ph-no-capture h-full min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-observation-trace-line",
            piece.tone === "fill"
              ? "bg-observation-trace-line hover:brightness-110 min-w-1"
              : "bg-muted-foreground/60 hover:bg-muted-foreground/80",
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

function IdleGap({ piece }: { piece: SessionTracePiece }) {
  const idle = piece.idle;
  const label = `Idle from ${idle?.fromClock} to ${idle?.toClock}, ${idle?.durationLabel}, between trace ${idle?.fromPosition} and ${idle?.toPosition}`;
  return (
    <CustomTooltip
      content={
        <TooltipLines
          title="Idle"
          rows={[
            ["From", `${idle?.fromClock} to ${idle?.toClock}`],
            ["Duration", idle?.durationLabel],
          ]}
        />
      }
    >
      {({ getTriggerProps }) => (
        <span
          role="img"
          aria-label={label}
          className={cn("h-full min-w-0", pieceClassName.idle)}
          style={{ flexGrow: piece.width, flexBasis: 0 }}
          {...getTriggerProps()}
          tabIndex={-1}
        />
      )}
    </CustomTooltip>
  );
}

function TooltipLines({
  title,
  rows,
}: {
  title: string;
  rows: readonly (readonly [string, string | undefined])[];
}) {
  return (
    <span className="ph-no-capture flex flex-col text-left">
      <span>{title}</span>
      {rows.map(([label, value]) => (
        <span key={label}>
          <span className="text-muted-foreground">{label} </span>
          {value}
        </span>
      ))}
    </span>
  );
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
