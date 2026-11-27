import type { Density } from "../../types";

export type TimeSpan = {
  /** ms offset from the trace origin */
  start: number;
  /** ms */
  duration: number;
};

export type Box = { width: number; height: number };

export type ViewTransform = {
  /** ms in view space → px from the lane's left edge */
  toPx: (ms: number) => number;
  /** px from the lane's left edge → ms in view space */
  toMs: (px: number) => number;
  pxPerMs: number;
};

export type LayoutNode = {
  id: string;
  name: string;
  type?: string;
  startTime: Date;
  endTime?: Date | null;
  /** seconds — the only duration a synthetic root span has */
  latency?: number;
  completionStartTime?: Date | null;
  children: LayoutNode[];
};

export type TimelineRow<TNode extends LayoutNode = LayoutNode> = {
  node: TNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
};

export type LabelPlacement = "inside" | "after" | "before" | "hidden";

export type PositionedNode<TNode extends LayoutNode = LayoutNode> = {
  node: TNode;
  id: string;
  name: string;
  type: string;
  index: number;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  y: number;
  height: number;
  x: number;
  width: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  offscreen: boolean;
  durationMs: number | null;
  firstTokenX: number | null;
  label: string;
  labelWidth: number;
  labelPlacement: LabelPlacement;
  labelX: number;
  startMs: number;
  endMs: number;
};

export type PreparedTimeline<TNode extends LayoutNode = LayoutNode> = {
  rows: Array<TimelineRow<TNode>>;
  originMs: number;
  durationMs: number;
  spans: Array<[number, number]>;
};

export type Tick = { realMs: number; x: number; label: string };

export type GapMarker = {
  x: number;
  width: number;
  durationMs: number;
  label: string;
};

export type TimeCompression = {
  enabled: boolean;
  durationMs: number;
  compressedDurationMs: number;
  gaps: readonly {
    start: number;
    end: number;
    durationMs: number;
    compressedStart: number;
    compressedEnd: number;
  }[];
  toCompressedMs: (realMs: number) => number;
  toRealMs: (compressedMs: number) => number;
};

export type TimelineLayout<TNode extends LayoutNode = LayoutNode> = {
  nodes: Array<PositionedNode<TNode>>;
  rowCount: number;
  rowHeight: number;
  contentHeight: number;
  traceSpace: TimeSpan;
  view: TimeSpan;
  pxPerMs: number;
  realDurationMs: number;
  originMs: number;
  ticks: Tick[];
  gaps: GapMarker[];
  compression: TimeCompression;
};

export type TextMeasurer = {
  measure: (text: string) => number;
};

export type LayoutInput<TNode extends LayoutNode = LayoutNode> = {
  roots: readonly TNode[];
  box: Box;
  density: Density;
  measurer: TextMeasurer;
  view: TimeSpan | null;
  compress: boolean;
  collapsed?: ReadonlySet<string>;
  prepared?: PreparedTimeline<TNode>;
  compression?: TimeCompression;
  rowRange?: { startIndex: number; endIndex: number };
  laneByRow?: readonly number[];
  /** Packed layout still mounts this span when it shares a pixel with another. */
  selectedId?: string | null;
  formatLabel?: (durationMs: number) => string;
  barInsetPx?: number;
};

export type TooltipPlacement = {
  left: number;
  top: number;
  transform: string;
  maxWidth: number;
};

export type BarTextTone = "light" | "dark";

export type PackedLaneRow = { depth: number };

export type PackedPacking = {
  lanes: number[];
  laneCount: number;
};

export type RowPresentation = "labelled" | "compact" | "hairline";

type RowWindow = { start: number; count: number };

export type Viewport = { time: TimeSpan; rows: RowWindow };

export type ViewportLimits = {
  traceSpace: TimeSpan;
  rowCount: number;
  boxHeight: number;
};

export type RowExtent = { startMs: number; endMs: number };
