import { type RouterOutputs } from "@/src/utils/api";
import {
  useMemo,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Minus, Plus } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useElementSize } from "@/src/hooks/useElementSize";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { TopicsEmptyState } from "./TopicsEmptyState";
import {
  type Facet,
  type FacetRow,
  allTopicsLabel,
  facetTopicTones,
  orderedFacetTopics,
} from "./facet-topics";
import { topicColor, topicToneColor } from "./topic-map-colors";
import {
  layoutTopicGrid,
  sampleGridPoints,
  type GridCell,
  type GridPoint,
} from "./topic-grid-layout";
import { TopicTraceList } from "./TopicTraceList";

const ZOOM_MIN = -3;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;
const CELL_MIN = 3;
const CELL_MAX = 28;
const PAD_X = 16;
const PAD_Y = 16;
/** Matches the hover card's `w-64`. */
const CARD_WIDTH = 256;
const CARD_OFFSET = 8;

export function TopicGridView({
  projectId,
  facet,
  mapResult,
  onOpenTrace,
  peekView,
  tracePanelRef,
  onGenerateTopics,
  canGenerateTopics,
}: TopicGridViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const counts = new Map(facet.topics.map((topic) => [topic.id, topic.count]));
  const tones = facetTopicTones(facet);
  const topics = orderedFacetTopics(facet).map((topic, index) => {
    const tone = tones.get(topic.id);
    return {
      ...topic,
      count: counts.get(topic.id) ?? 0,
      color: tone ? topicToneColor(tone) : topicColor(index),
    };
  });
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const rowsById = useMemo(
    () => new Map(facet.rows.map((row) => [row.traceId, row])),
    [facet.rows],
  );
  const mapData = mapResult.data;
  const { points, perDot } = useMemo(() => {
    if (mapData?.status !== "ready") return { points: [], perDot: 1 };
    const indexById = new Map(
      orderedFacetTopics(facet).map((topic, index) => [topic.id, index]),
    );
    return sampleGridPoints(
      mapData.points.map(
        (point): GridPoint => ({
          id: point.traceId,
          x: point.x,
          y: point.y,
          topicIndex: point.topicId ? (indexById.get(point.topicId) ?? -1) : -1,
        }),
      ),
    );
  }, [mapData, facet]);
  if (topics.length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  const selectedIndex = selectedTopic
    ? topics.findIndex((topic) => topic.id === selectedTopic.id)
    : null;
  const message = facet.map
    ? gridMessage(mapResult)
    : "No map published for this facet.";
  const listRows = selectedTopic
    ? facet.rows.filter((row) => row.topicId === selectedTopic.id)
    : facet.rows;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
      <section
        aria-label="Topic grid"
        className="flex min-h-48 min-w-0 shrink-0 basis-1/2 flex-col overflow-hidden lg:shrink lg:basis-3/5"
      >
        {message ? (
          <GridMessage>{message}</GridMessage>
        ) : (
          <TopicGrid
            points={points}
            perDot={perDot}
            topics={topics}
            rowsById={rowsById}
            selectedIndex={selectedIndex}
            onSelectTopic={setSelectedTopicId}
            onOpenTrace={onOpenTrace}
          />
        )}
      </section>
      <TopicTraceList
        projectId={projectId}
        title={selectedTopic?.name ?? allTopicsLabel(facet.name)}
        swatchColor={
          selectedIndex !== null ? topics[selectedIndex]?.color : undefined
        }
        rows={listRows}
        peekView={peekView}
        tracePanelRef={tracePanelRef}
        divider="side"
      />
    </div>
  );
}

function GridMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground p-4 text-sm">{children}</p>;
}

function TopicGrid({
  points,
  perDot,
  topics,
  rowsById,
  selectedIndex,
  onSelectTopic,
  onOpenTrace,
}: TopicGridProps) {
  const [zoom, setZoom] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLabelIndex, setHoveredLabelIndex] = useState<number | null>(
    null,
  );
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
  const hoveredCell = hoveredId ? (cellById.get(hoveredId) ?? null) : null;
  const hoveredIndex = hoveredCell ? hoveredCell.topicIndex : hoveredLabelIndex;
  const fit = size
    ? Math.min(innerWidth / layout.cols, innerHeight / layout.rows)
    : 0;
  const cell = clamp(fit * ZOOM_STEP ** zoom, CELL_MIN, CELL_MAX);
  const gap = Math.max(0.5, cell * 0.16);
  const radius = cell * 0.18;
  const gridWidth = layout.cols * cell;
  const gridHeight = layout.rows * cell;

  function traceIdAt(event: PointerEvent<SVGElement> | MouseEvent<SVGElement>) {
    const target = event.target as Element;
    return target.getAttribute("data-trace-id");
  }
  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const id = traceIdAt(event);
    if (id !== hoveredId) setHoveredId(id);
  }
  function handlePointerLeave() {
    setHoveredId(null);
  }
  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const id = traceIdAt(event);
    if (id) onOpenTrace(id);
  }
  function showAllTopics() {
    onSelectTopic(null);
  }
  function zoomIn() {
    setZoom((current) => Math.min(ZOOM_MAX, current + 1));
  }
  function zoomOut() {
    setZoom((current) => Math.max(ZOOM_MIN, current - 1));
  }

  const squares = hoveredCell
    ? [...layout.cells.filter((item) => item.id !== hoveredId), hoveredCell]
    : layout.cells;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-end gap-2 px-4">
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
      <div className="flex min-h-0 flex-1 flex-col border-t">
        <div
          ref={containerRef}
          className="relative flex min-h-0 flex-1 overflow-auto overscroll-contain"
        >
          {points.length === 0 ? (
            <GridMessage>No positioned traces in this time range.</GridMessage>
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
                  {hoveredCell && (
                    <GridHoverCard
                      cell={hoveredCell}
                      topicName={
                        topics[hoveredCell.topicIndex]?.name ?? "No topic"
                      }
                      count={
                        topics[hoveredCell.topicIndex]?.count ??
                        (countByIndex.get(hoveredCell.topicIndex) ?? 0) * perDot
                      }
                      row={rowsById.get(hoveredCell.id)}
                      members={(
                        hoveredCell.memberIds ?? [hoveredCell.id]
                      ).flatMap((id) => {
                        const member = rowsById.get(id);
                        return member ? [member] : [];
                      })}
                      color={colorAt(topics, hoveredCell.topicIndex)}
                      cellSize={cell}
                      grid={layout}
                    />
                  )}
                </div>
              </div>
            )
          )}
        </div>
        <GridLegend
          topics={topics}
          selectedIndex={selectedIndex}
          onSelectTopic={onSelectTopic}
          onHoverTopic={setHoveredLabelIndex}
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
      </div>
    </>
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
    <div className="flex max-h-48 shrink-0 flex-col overflow-hidden border-t">
      <ul
        aria-label="Topics"
        className="grid min-h-0 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto p-2"
      >
        {entries.map((entry) => {
          const { topic } = entry;
          const isSelected = entry.topicIndex === selectedIndex;
          function select() {
            onSelectTopic(isSelected ? null : topic.id);
          }
          function hover() {
            onHoverTopic(entry.topicIndex);
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

function GridHoverCard({
  cell,
  topicName,
  count,
  row,
  cellSize,
  grid,
  members,
  color,
}: GridHoverCardProps) {
  const gridWidth = grid.cols * cellSize;
  const fitsRight =
    (cell.col + 1) * cellSize + CARD_OFFSET + CARD_WIDTH <= gridWidth;
  const left = fitsRight
    ? (cell.col + 1) * cellSize + CARD_OFFSET
    : Math.max(0, cell.col * cellSize - CARD_OFFSET - CARD_WIDTH);
  const below = cell.row < grid.rows / 2;
  const top = below ? cell.row * cellSize : (cell.row + 1) * cellSize;
  const shortId = cell.id.length > 8 ? `${cell.id.slice(0, 8)}…` : cell.id;
  const started = row
    ? formatCompactRelativeTime(new Date(row.unitStartTime))
    : null;
  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground pointer-events-none absolute w-64 rounded-md border p-2 shadow-md"
      style={{ left, top, translate: below ? undefined : "0 -100%" }}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-xs"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 truncate font-bold" title={topicName}>
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
              "click to open the first",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 line-clamp-2 text-xs">
            {row?.summary || "No applicable summary."}
          </p>
          <p
            className="text-muted-foreground text-2xs mt-1 truncate font-mono"
            title={cell.id}
          >
            {[shortId, started, "click to open"].filter(Boolean).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}

function gridMessage(mapResult: TopicGridViewProps["mapResult"]) {
  if (mapResult.error) return `Grid could not load: ${mapResult.error.message}`;
  if (!mapResult.data) return "Loading grid…";
  if (mapResult.data.status !== "ready") {
    return (
      mapResult.data.reason ?? "This run has no saved embedding projection."
    );
  }
  return null;
}

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

type TopicGridViewProps = {
  projectId: string;
  facet: Facet;
  mapResult: {
    data?: RouterOutputs["topics"]["map"];
    error: { message: string } | null;
  };
  onOpenTrace: (traceId: string) => void;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};

type TopicGridProps = {
  points: GridPoint[];
  perDot: number;
  topics: GridTopic[];
  rowsById: Map<string, FacetRow>;
  selectedIndex: number | null;
  onSelectTopic: (topicId: string | null) => void;
  onOpenTrace: (traceId: string) => void;
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
};

type GridTopic = ReturnType<typeof orderedFacetTopics>[number] & {
  count: number;
  color: string;
};

type GridLegendProps = {
  children: ReactNode;
  topics: TopicGridProps["topics"];
  selectedIndex: number | null;
  onSelectTopic: (topicId: string | null) => void;
  onHoverTopic: (topicIndex: number | null) => void;
};
