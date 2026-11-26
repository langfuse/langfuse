import { useLayoutEffect, useRef, useState } from "react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";
import { layoutSessionTracePieces } from "./fns/layoutSessionTracePieces";
import { tracesFitHitTarget } from "./fns/tracesFitHitTarget";

type SessionTracePiece = ReturnType<
  typeof layoutSessionTracePieces
>["pieces"][number];

const pillClassName = "rounded-sm";
const idleClassName = "border-border border-x border-dashed";

const pieceClassName = {
  fill: `bg-observation-trace-line shadow-sm dark:shadow-none ${pillClassName}`,
  muted: `bg-observation-trace-line/20 ${pillClassName}`,
  idle: idleClassName,
  rest: idleClassName,
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
      className="bg-muted relative flex h-[22px] min-w-0 flex-1 overflow-hidden rounded-md p-0.5"
    >
      {pieces.map((piece, index) => {
        const trace = piece.trace;
        const interactive = clickable && trace && onSelect;
        let edge: "start" | "end" | undefined;
        if (index === 0) edge = "start";
        else if (index === pieces.length - 1) edge = "end";
        return (
          <span
            key={trace ? trace.id : `${piece.tone}-${index}`}
            className="flex h-full min-w-0 px-px"
            style={{ flexGrow: piece.width, flexBasis: 0 }}
          >
            {renderPiece(
              piece,
              Boolean(interactive),
              traces.length,
              onSelect,
              edge,
            )}
          </span>
        );
      })}
      <TrackTimes
        width={width}
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
  width,
  startClock,
  endClock,
  active,
  edgeTone,
}: {
  width: number;
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
  const activeStartRef = useRef<HTMLSpanElement>(null);
  const activeEndRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState({
    start: true,
    end: true,
    active: "both" as "both" | "start" | "none",
    activeStartLeft: 0,
    activeEndLeft: 0,
  });

  useLayoutEffect(() => {
    const track = startRef.current?.parentElement?.parentElement;
    const activeSegment = track?.querySelector("[data-active]");
    if (!track || !(activeSegment instanceof HTMLElement)) return;
    const trackBox = track.getBoundingClientRect();
    const segmentBox = activeSegment.getBoundingClientRect();
    const startBox = startRef.current?.getBoundingClientRect();
    const endBox = endRef.current?.getBoundingClientRect();
    const activeStartBox = activeStartRef.current?.getBoundingClientRect();
    const activeEndBox = activeEndRef.current?.getBoundingClientRect();
    const startSegment = track.querySelector("[data-edge=start]");
    const endSegment = track.querySelector("[data-edge=end]");
    const startSegmentBox = boxOf(startSegment);
    const endSegmentBox = boxOf(endSegment);
    const pad = 6;
    const activeStartWidth = activeStartBox?.width ?? 0;
    const activeEndWidth = activeEndBox?.width ?? 0;
    const bothFit =
      activeStartWidth + activeEndWidth + pad * 2 + 4 <= segmentBox.width;
    const startFits = activeStartWidth + pad * 2 <= segmentBox.width;
    let nextActive: "both" | "start" | "none" = "none";
    if (bothFit) nextActive = "both";
    else if (startFits) nextActive = "start";
    const activeStartLeft = segmentBox.left - trackBox.left + pad;
    const activeEndLeft =
      segmentBox.right - trackBox.left - activeEndWidth - pad;
    const activeStartRight = trackBox.left + activeStartLeft + activeStartWidth;
    const activeEndRight =
      nextActive === "both"
        ? trackBox.left + activeEndLeft + activeEndWidth
        : activeStartRight;
    const sessionEdgesCollide = Boolean(
      startBox && endBox && startBox.right + 4 > endBox.left,
    );
    const hitsActive = (label: DOMRect | undefined) =>
      Boolean(
        nextActive !== "none" &&
        label &&
        label.right + 4 > trackBox.left + activeStartLeft &&
        label.left - 4 < activeEndRight,
      );
    const next = {
      start: Boolean(
        fitsIn(startBox, startSegmentBox) &&
        !sessionEdgesCollide &&
        !hitsActive(startBox),
      ),
      end: Boolean(
        fitsIn(endBox, endSegmentBox) &&
        !sessionEdgesCollide &&
        !hitsActive(endBox),
      ),
      active: nextActive,
      activeStartLeft,
      activeEndLeft,
    };
    setVisible((current) =>
      current.start === next.start &&
      current.end === next.end &&
      current.active === next.active &&
      Math.abs(current.activeStartLeft - next.activeStartLeft) < 0.5 &&
      Math.abs(current.activeEndLeft - next.activeEndLeft) < 0.5
        ? current
        : next,
    );
  }, [
    width,
    startClock,
    endClock,
    active?.index,
    active?.clock,
    active?.endClock,
  ]);

  const edgeClass = (tone?: SessionTracePiece["tone"]) =>
    tone === "fill" ? "text-background" : "text-muted-foreground";

  return (
    <div className="pointer-events-none absolute inset-0 text-[10px] leading-none tabular-nums">
      <span
        ref={startRef}
        className={cn(
          "ph-no-capture absolute top-1/2 left-1.5 -translate-y-1/2",
          edgeClass(edgeTone.start),
          !visible.start && "invisible",
        )}
      >
        {startClock}
      </span>
      <span
        ref={endRef}
        className={cn(
          "ph-no-capture absolute top-1/2 right-1.5 -translate-y-1/2",
          edgeClass(edgeTone.end),
          !visible.end && "invisible",
        )}
      >
        {endClock}
      </span>
      {active ? (
        <span
          ref={activeStartRef}
          className={cn(
            "text-background ph-no-capture absolute top-1/2 -translate-y-1/2",
            visible.active === "none" && "invisible",
          )}
          style={{ left: visible.activeStartLeft }}
        >
          {active.clock}
        </span>
      ) : null}
      {active ? (
        <span
          ref={activeEndRef}
          className={cn(
            "text-background ph-no-capture absolute top-1/2 -translate-y-1/2",
            visible.active !== "both" && "invisible",
          )}
          style={{ left: visible.activeEndLeft }}
        >
          {active.endClock}
        </span>
      ) : null}
    </div>
  );
}

function fitsIn(label: DOMRect | undefined, segment: DOMRect | undefined) {
  return Boolean(label && segment && label.width + 12 <= segment.width);
}

function boxOf(node: Element | null) {
  return node instanceof HTMLElement ? node.getBoundingClientRect() : undefined;
}

function renderPiece(
  piece: SessionTracePiece,
  interactive: boolean,
  total: number,
  onSelect: ((index: number) => void) | undefined,
  edge: "start" | "end" | undefined,
) {
  const trace = piece.trace;
  if (interactive && trace && onSelect) {
    return (
      <TraceSegmentButton
        piece={piece}
        total={total}
        edge={edge}
        onSelect={() => onSelect(trace.index)}
      />
    );
  }
  if (piece.idle) return <IdleGap piece={piece} edge={edge} />;
  return (
    <span
      className={cn(
        "h-full w-full min-w-0",
        pieceClassName[piece.tone],
        piece.tone === "fill" && "min-w-1",
      )}
      data-edge={edge}
      data-active={piece.tone === "fill" ? "" : undefined}
    />
  );
}

function TraceSegmentButton({
  piece,
  total,
  onSelect,
  edge,
}: {
  piece: SessionTracePiece;
  total: number;
  onSelect: () => void;
  edge?: "start" | "end";
}) {
  const trace = piece.trace;
  const label = `Go to trace ${trace?.position} of ${total}, ${trace?.clock}`;
  return (
    <CustomTooltip
      content={
        <TooltipLines
          title={trace?.name ?? ""}
          subtitle={`Trace ${trace?.position} of ${total}`}
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
            "ph-no-capture h-full w-full min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-observation-trace-line",
            piece.tone === "fill"
              ? "bg-observation-trace-line hover:brightness-110 min-w-1 rounded-sm shadow-sm dark:shadow-none"
              : "bg-observation-trace-line/20 hover:bg-observation-trace-line/30 rounded-sm",
          )}
          data-edge={edge}
          data-active={piece.tone === "fill" ? "" : undefined}
          onClick={onSelect}
          {...getTriggerProps()}
        />
      )}
    </CustomTooltip>
  );
}

function IdleGap({
  piece,
  edge,
}: {
  piece: SessionTracePiece;
  edge?: "start" | "end";
}) {
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
          data-edge={edge}
          aria-label={label}
          className={cn("h-full w-full min-w-0", pieceClassName.idle)}
          {...getTriggerProps()}
          tabIndex={-1}
        />
      )}
    </CustomTooltip>
  );
}

function TooltipLines({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: readonly (readonly [string, string | undefined])[];
}) {
  return (
    <span className="ph-no-capture flex flex-col text-left">
      <span>{title}</span>
      {subtitle ? (
        <span className="text-muted-foreground">{subtitle}</span>
      ) : null}
      {rows.map(([label, value]) => (
        <span key={label}>
          <span className="text-muted-foreground">{label} </span>
          {value}
        </span>
      ))}
    </span>
  );
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
