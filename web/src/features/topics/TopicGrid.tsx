import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Minus, Plus } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useElementSize } from "@/src/hooks/useElementSize";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { type FacetRow } from "./facet-topics";
import { type prepareTopicGrid } from "./prepare-topic-grid";
import { topicColor } from "./topic-map-colors";
import { TopicPreviewCard } from "./TopicPreviewCard";
import {
  layoutTopicGrid,
  type GridCell,
  type GridPoint,
} from "./topic-grid-layout";

type TopicGridProps = {
  points: GridPoint[];
  perDot: number;
  topics: GridTopic[];
  rowsById: Map<string, FacetRow>;
  selectedIndex: number | null;
  onSelectTopic: (topicId: string | null) => void;
  onSelectTrace: (traceId: string) => void;
  previewOnSelect?: boolean;
  /** Matches the trace list header in the side-by-side layout so both dividers line up. */
  barHeight?: number;
};

type GridHoverCardProps = {
  cell: GridCell;
  topicName: string;
  count: number;
  row: FacetRow | undefined;
  cellSize: number;
  grid: { cols: number; rows: number };
  members: FacetRow[];
  color: string;
  previewOnSelect: boolean;
};

type GridTopic = ReturnType<typeof prepareTopicGrid>["topics"][number];
type GridHoverTarget = { kind: "trace" | "topic"; id: string } | null;

type GridLegendProps = {
  children: ReactNode;
  topics: TopicGridProps["topics"];
  selectedIndex: number | null;
  onSelectTopic: (topicId: string | null) => void;
  onHoverTopic: (topicId: string | null) => void;
};

const ZOOM_MIN = -3;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;
const CELL_MIN = 3;
const CELL_MAX = 28;
const PAD_X = 16;
const PAD_Y = 16;
const CARD_OFFSET = 8;

function squareOpacity(
  topicIndex: number,
  selectedIndex: number | null,
  hoveredIndex: number | null,
  isHovered: boolean,
) {
  if (isHovered) return 1;
  const hasSelection = selectedIndex !== null;
  let opacity: number;
  if (topicIndex < 0) opacity = hasSelection ? 0.1 : 0.2;
  else if (!hasSelection) opacity = 0.35;
  else opacity = topicIndex === selectedIndex ? 1 : 0.12;
  if (topicIndex >= 0 && topicIndex === hoveredIndex) {
    opacity = Math.max(opacity, 0.7);
  }
  return opacity;
}

function colorAt(topics: GridTopic[], topicIndex: number) {
  return topics[topicIndex]?.color ?? topicColor(-1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function GridHoverCard({
  cell,
  topicName,
  count,
  row,
  cellSize,
  grid,
  members,
  color,
  previewOnSelect,
}: GridHoverCardProps) {
  // Card sits above/below the dot, growing toward the grid center, so it never covers it.
  const toLeft = cell.col >= grid.cols / 2;
  const below = cell.row < grid.rows / 2;
  const left = (cell.col + (toLeft ? 1 : 0)) * cellSize;
  const top = below
    ? (cell.row + 1) * cellSize + CARD_OFFSET
    : cell.row * cellSize - CARD_OFFSET;
  const shortId = cell.id.length > 8 ? `${cell.id.slice(0, 8)}…` : cell.id;
  const started = row
    ? formatCompactRelativeTime(new Date(row.unitStartTime))
    : null;
  return (
    <div
      role="tooltip"
      className={cn(
        "bg-popover text-popover-foreground pointer-events-none absolute rounded-md border p-2 shadow-md",
        previewOnSelect ? "right-2 bottom-2 left-2" : "w-64",
      )}
      style={
        previewOnSelect
          ? undefined
          : {
              left,
              top,
              translate: `${toLeft ? "-100%" : "0"} ${below ? "0" : "-100%"}`,
            }
      }
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-xs"
          style={{ backgroundColor: color }}
        />
        <span
          className={cn(
            "min-w-0 font-bold",
            previewOnSelect ? "line-clamp-2" : "truncate",
          )}
          title={topicName}
        >
          {topicName}
        </span>
        <span className="text-muted-foreground text-2xs ml-auto shrink-0 font-mono">
          {count.toLocaleString()} traces
        </span>
      </div>
      {members.length > 1 ? (
        <>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {members.slice(0, 3).map((member) => (
              <li key={member.traceId} className="line-clamp-1">
                {member.summary || "No applicable summary."}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-2xs mt-1 font-mono">
            {[
              `${members.length.toLocaleString()} traces in this dot`,
              members.length > 3
                ? `+${(members.length - 3).toLocaleString()} more`
                : null,
              !previewOnSelect && "click to open the first",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <>
          <p
            className={cn(
              "mt-1 text-xs",
              previewOnSelect ? "line-clamp-4" : "line-clamp-2",
            )}
          >
            {row?.summary || "No applicable summary."}
          </p>
          <p
            className="text-muted-foreground text-2xs mt-1 truncate font-mono"
            title={cell.id}
          >
            {[shortId, started, !previewOnSelect && "click to open"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      )}
      {previewOnSelect && (
        <p className="text-muted-foreground mt-2 text-xs">
          Tap again to view {members.length > 1 ? "the first trace" : "trace"}
        </p>
      )}
    </div>
  );
}

function GridLegend({
  topics,
  selectedIndex,
  onSelectTopic,
  onHoverTopic,
  children,
}: GridLegendProps) {
  const entries = topics
    .map((topic, topicIndex) => ({ topic, topicIndex }))
    .filter(({ topic }) => topic.count > 0)
    .sort((a, b) => b.topic.count - a.topic.count);
  function clearHover() {
    onHoverTopic(null);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t">
      <ul
        aria-label="Topics"
        className="grid min-h-0 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto p-2"
      >
        {entries.map((entry) => {
          const { topic } = entry;
          const isSelected = entry.topicIndex === selectedIndex;
          function select() {
            onSelectTopic(topic.id);
          }
          function hover() {
            onHoverTopic(topic.id);
          }
          return (
            <li key={topic.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={select}
                onPointerEnter={hover}
                onPointerLeave={clearHover}
                onFocus={hover}
                onBlur={clearHover}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden",
                  isSelected && "bg-accent font-bold",
                  selectedIndex !== null &&
                    !isSelected &&
                    "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: colorAt(topics, entry.topicIndex) }}
                />
                <span className="min-w-0 flex-1 truncate" title={topic.name}>
                  {topic.name}
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {topic.count.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="text-muted-foreground flex shrink-0 items-center gap-2 px-3.5 pb-2 text-xs">
        {children}
      </div>
    </div>
  );
}

export function TopicGrid({
  points,
  perDot,
  topics,
  rowsById,
  selectedIndex,
  onSelectTopic,
  onSelectTrace,
  barHeight,
  previewOnSelect = false,
}: TopicGridProps) {
  const [zoom, setZoom] = useState(0);
  const [hoverTarget, setHoverTarget] = useState<GridHoverTarget>(null);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const innerWidth = size ? Math.max(1, size.width - 2 * PAD_X) : 0;
  const innerHeight = size ? Math.max(1, size.height - 2 * PAD_Y) : 0;
  const aspect = size ? Math.round((innerWidth / innerHeight) * 4) / 4 : 1;
  const layout = useMemo(
    () => layoutTopicGrid(points, aspect),
    [points, aspect],
  );
  const cellById = useMemo(
    () => new Map(layout.cells.map((cell) => [cell.id, cell])),
    [layout],
  );
  const countByIndex = useMemo(() => {
    const counts = new Map<number, number>();
    for (const cell of layout.cells) {
      counts.set(cell.topicIndex, (counts.get(cell.topicIndex) ?? 0) + 1);
    }
    return counts;
  }, [layout]);

  const selectedId =
    selectedIndex === null ? null : (topics[selectedIndex]?.id ?? null);
  const hoveredId = hoverTarget?.kind === "trace" ? hoverTarget.id : null;
  const hoveredLabelIndex =
    hoverTarget?.kind === "topic"
      ? topics.findIndex((topic) => topic.id === hoverTarget.id)
      : -1;
  const hoveredCell = hoveredId ? (cellById.get(hoveredId) ?? null) : null;
  const hoveredIndex =
    hoveredCell?.topicIndex ??
    (hoveredLabelIndex < 0 ? null : hoveredLabelIndex);
  const fit = size
    ? Math.min(innerWidth / layout.cols, innerHeight / layout.rows)
    : 0;
  // Zoom from the displayed size, so steps take effect even when fit exceeds the cap.
  const baseCell = clamp(fit, CELL_MIN, CELL_MAX);
  const cell = clamp(baseCell * ZOOM_STEP ** zoom, CELL_MIN, CELL_MAX);
  const gap = Math.max(0.5, cell * 0.16);
  const radius = cell * 0.18;
  const gridWidth = layout.cols * cell;
  const gridHeight = layout.rows * cell;

  function traceIdAt(event: PointerEvent<SVGElement> | MouseEvent<SVGElement>) {
    const target = event.target as Element;
    return target.getAttribute("data-trace-id");
  }
  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (previewOnSelect) return;
    const id = traceIdAt(event);
    if (id !== hoveredId) setHoverTarget(id ? { kind: "trace", id } : null);
  }
  function handlePointerLeave() {
    if (previewOnSelect) return;
    setHoverTarget(null);
  }
  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const id = traceIdAt(event);
    if (previewOnSelect && id !== hoveredId) {
      setHoverTarget(id ? { kind: "trace", id } : null);
      return;
    }
    setHoverTarget(null);
    if (id) onSelectTrace(id);
  }
  function selectTopic(id: string | null) {
    if (
      previewOnSelect &&
      id !== null &&
      (hoverTarget?.kind !== "topic" || hoverTarget.id !== id)
    ) {
      setHoverTarget({ kind: "topic", id });
      return;
    }
    setHoverTarget(null);
    onSelectTopic(!previewOnSelect && id === selectedId ? null : id);
  }
  function hoverTopic(id: string | null) {
    if (!previewOnSelect) setHoverTarget(id ? { kind: "topic", id } : null);
  }
  function dismissPreview(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      !event.target.closest("[data-trace-id], button")
    ) {
      setHoverTarget(null);
    }
  }
  function showAllTopics() {
    setHoverTarget(null);
    onSelectTopic(null);
  }
  function zoomIn() {
    setHoverTarget(null);
    setZoom((current) => Math.min(ZOOM_MAX, current + 1));
  }
  function zoomOut() {
    setHoverTarget(null);
    setZoom((current) => Math.max(ZOOM_MIN, current - 1));
  }

  const squares = hoveredCell
    ? [...layout.cells.filter((item) => item.id !== hoveredId), hoveredCell]
    : layout.cells;
  const hoverCard = hoveredCell && (
    <GridHoverCard
      cell={hoveredCell}
      topicName={topics[hoveredCell.topicIndex]?.name ?? "No topic"}
      count={
        topics[hoveredCell.topicIndex]?.count ??
        (countByIndex.get(hoveredCell.topicIndex) ?? 0) * perDot
      }
      row={rowsById.get(hoveredCell.id)}
      members={(hoveredCell.memberIds ?? [hoveredCell.id]).flatMap((id) => {
        const member = rowsById.get(id);
        return member ? [member] : [];
      })}
      color={colorAt(topics, hoveredCell.topicIndex)}
      cellSize={cell}
      grid={layout}
      previewOnSelect={previewOnSelect}
    />
  );

  return (
    <>
      <div
        className={cn(
          "flex h-12 shrink-0 items-center justify-end gap-2 px-4",
          barHeight && "lg:h-(--bar-height)",
        )}
        style={
          barHeight
            ? ({ "--bar-height": `${barHeight}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="flex items-center gap-0.5">
          <IconButton
            icon={Minus}
            label="Zoom out (−)"
            size="sm"
            disabled={zoom <= ZOOM_MIN || cell <= CELL_MIN}
            onClick={zoomOut}
          />
          <IconButton
            icon={Plus}
            label="Zoom in (+)"
            size="sm"
            disabled={zoom >= ZOOM_MAX || cell >= CELL_MAX}
            onClick={zoomIn}
          />
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 flex-col border-t"
        onClick={dismissPreview}
      >
        <div
          ref={containerRef}
          className="relative flex min-h-0 flex-[2] overflow-auto overscroll-contain"
        >
          {points.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              No positioned traces in this time range.
            </p>
          ) : (
            size && (
              <div
                className="m-auto shrink-0"
                style={{ padding: `${PAD_Y}px ${PAD_X}px` }}
              >
                <div
                  className="relative"
                  style={{ width: gridWidth, height: gridHeight }}
                >
                  <svg
                    width={gridWidth}
                    height={gridHeight}
                    role="img"
                    aria-label={`Topic grid, ${points.length.toLocaleString()} traces`}
                    className="block"
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                    onClick={handleClick}
                  >
                    {squares.map((square) => {
                      const isHovered = square.id === hoveredId;
                      const grow = isHovered ? gap / 2 : 0;
                      return (
                        <rect
                          key={square.id}
                          data-trace-id={square.id}
                          className="cursor-pointer"
                          x={square.col * cell + gap / 2 - grow}
                          y={square.row * cell + gap / 2 - grow}
                          width={cell - gap + grow * 2}
                          height={cell - gap + grow * 2}
                          rx={radius}
                          fill={colorAt(topics, square.topicIndex)}
                          fillOpacity={squareOpacity(
                            square.topicIndex,
                            selectedIndex,
                            hoveredIndex,
                            isHovered,
                          )}
                          stroke={isHovered ? "hsl(var(--foreground))" : "none"}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                  {!previewOnSelect && hoverCard}
                </div>
              </div>
            )
          )}
        </div>
        <GridLegend
          topics={topics}
          selectedIndex={
            previewOnSelect && hoveredLabelIndex >= 0
              ? hoveredLabelIndex
              : selectedIndex
          }
          onSelectTopic={selectTopic}
          onHoverTopic={hoverTopic}
        >
          <span>
            {perDot > 1
              ? `1 dot ≈ ${perDot.toLocaleString()} traces`
              : "1 dot = 1 trace"}
          </span>
          <Button
            text="Show all topics"
            variant="ghost"
            size="sm"
            disabled={selectedId === null}
            onClick={showAllTopics}
          />
        </GridLegend>
        {previewOnSelect && hoverCard}
        {previewOnSelect &&
          hoveredLabelIndex >= 0 &&
          topics[hoveredLabelIndex] && (
            <div className="pointer-events-none absolute right-2 bottom-2 left-2">
              <TopicPreviewCard
                topic={topics[hoveredLabelIndex]}
                total={rowsById.size}
              />
            </div>
          )}
      </div>
    </>
  );
}
