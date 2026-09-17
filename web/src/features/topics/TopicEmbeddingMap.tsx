import { type ReactNode, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { useElementSize } from "@/src/hooks/useElementSize";
import { api, type RouterOutputs } from "@/src/utils/api";

type Topic = Pick<
  RouterOutputs["topics"]["runs"][number]["topics"][number],
  "id" | "name"
>;
type MapData = RouterOutputs["topics"]["map"];
const pointGroup = (point: MapData["points"][number]) =>
  point.outcome === "unassigned" ? "unassigned" : (point.topicId ?? "outliers");

const COLORS = [
  "#7c3aed",
  "#0284c7",
  "#059669",
  "#d97706",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#c2410c",
  "#65a30d",
  "#a21caf",
];
export const topicColor = (index: number) =>
  index < 0 ? "#94a3b8" : COLORS[index % COLORS.length];

function fitMapPoints(
  points: MapData["points"],
  cohort: MapData["points"],
  width: number,
  height: number,
) {
  const count = Math.max(cohort.length, 1);
  const centerX = cohort.reduce((sum, point) => sum + point.x, 0) / count;
  const centerY = cohort.reduce((sum, point) => sum + point.y, 0) / count;
  let varianceX = 0,
    varianceY = 0,
    covariance = 0;
  for (const point of cohort) {
    const dx = point.x - centerX,
      dy = point.y - centerY;
    varianceX += dx * dx;
    varianceY += dy * dy;
    covariance += dx * dy;
  }
  // Align the cohort's principal axis horizontally without changing distances.
  // Keep this orientation when zooming into a topic.
  const angle = Math.atan2(2 * covariance, varianceX - varianceY) / 2;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const rotated = points.map((point) => ({
    ...point,
    x: (point.x - centerX) * cosine + (point.y - centerY) * sine,
    y: -(point.x - centerX) * sine + (point.y - centerY) * cosine,
  }));
  const bounds = rotated.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const { minX, maxX, minY, maxY } = rotated.length
    ? bounds
    : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const scale = Math.min(
    Math.max(width - 48, 1) / Math.max(maxX - minX, 0.01),
    Math.max(height - 48, 1) / Math.max(maxY - minY, 0.01),
  );
  return rotated.map((point) => ({
    ...point,
    x: width / 2 + (point.x - (maxX + minX) / 2) * scale,
    y: height / 2 - (point.y - (maxY + minY) / 2) * scale,
  }));
}

export function TopicEmbeddingMap({
  projectId,
  executionId,
  facetVersionId,
  topics,
  selectedTopic,
  onSelectTopic,
  headerActions,
  onSelectTrace,
  selectedTraceId,
}: {
  projectId: string;
  executionId: string;
  facetVersionId: string;
  topics: Topic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  headerActions?: ReactNode;
  onSelectTrace?: (traceId: string | null) => void;
  selectedTraceId?: string | null;
}) {
  const query = api.topics.map.useQuery({
    projectId,
    executionId,
    facetVersionId,
  });
  if (query.error)
    return (
      <p role="alert" className="text-destructive text-sm">
        Map could not load: {query.error.message}
      </p>
    );
  if (!query.data)
    return (
      <div className="bg-muted/20 flex h-72 items-center justify-center rounded-lg border text-sm">
        Loading embedding map…
      </div>
    );
  if (query.data.status !== "ready")
    return (
      <p className="text-muted-foreground rounded-lg border p-4 text-sm">
        {query.data.reason ?? "This run has no saved embedding projection."}
      </p>
    );
  return (
    <EmbeddingMapView
      key={query.data.runId}
      projectId={projectId}
      data={query.data}
      topics={topics}
      selectedTopic={selectedTopic}
      onSelectTopic={onSelectTopic}
      headerActions={headerActions}
      onSelectTrace={onSelectTrace}
      selectedTraceId={selectedTraceId}
    />
  );
}

function EmbeddingMapView({
  projectId,
  data,
  topics,
  selectedTopic,
  onSelectTopic,
  headerActions,
  onSelectTrace,
  selectedTraceId,
}: {
  projectId: string;
  data: MapData;
  topics: Topic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  headerActions?: ReactNode;
  onSelectTrace?: (traceId: string | null) => void;
  selectedTraceId?: string | null;
}) {
  const [plotRef, plotSize] = useElementSize<HTMLDivElement>();
  const width = plotSize?.width || 960;
  const height = plotSize?.height || 320;
  const plotted =
    selectedTopic === null
      ? data.points
      : data.points.filter((point) => pointGroup(point) === selectedTopic);
  const [localSelectedId, setSelectedId] = useState<string | null>(null);
  const selectedId =
    selectedTraceId === undefined
      ? localSelectedId
      : (data.points.find((point) => point.traceId === selectedTraceId)
          ?.summaryId ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabStopId = plotted.some((point) => point.summaryId === focusedId)
    ? focusedId
    : plotted[0]?.summaryId;
  const active = plotted.find(
    (point) => point.summaryId === (hoveredId ?? selectedId),
  );
  const groups = [
    ...topics.map((topic, index) => ({
      id: topic.id,
      name: topic.name,
      color: topicColor(index),
    })),
    { id: "outliers", name: "Outliers", color: topicColor(-1) },
    { id: "unassigned", name: "Assignment unavailable", color: topicColor(-1) },
  ].map((group) => ({
    ...group,
    count: data.points.filter((point) => pointGroup(point) === group.id).length,
  }));
  const positioned = fitMapPoints(plotted, data.points, width, height);
  const activeGroup = active
    ? groups.find((group) => group.id === pointGroup(active))
    : null;
  return (
    <section
      className="ph-no-capture overflow-hidden rounded-lg border"
      aria-label="Embedding map"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h4 className="font-bold">Embedding map</h4>
          <p className="text-muted-foreground mt-1 text-xs">
            Each dot is one trace’s facet summary. Select a dot to read it, or a
            topic to zoom in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {selectedTopic !== null ? `${plotted.length} of ` : ""}
            {data.points.length} summaries · {topics.length} topics
          </span>
          {headerActions}
        </div>
      </div>
      <div className="px-4 pt-4">
        <div
          className="flex h-2 overflow-hidden rounded-full"
          aria-label="Topic distribution in discovery cohort"
        >
          {groups
            .filter((group) => group.count > 0)
            .map((group) => (
              <button
                key={group.id}
                style={{ backgroundColor: group.color, flexGrow: group.count }}
                aria-label={`${group.name}: ${group.count} summaries`}
                title={`${group.name}: ${group.count}`}
                onClick={() =>
                  onSelectTopic(selectedTopic === group.id ? null : group.id)
                }
              />
            ))}
        </div>
      </div>
      <div ref={plotRef} className="h-48 w-full sm:h-72 lg:h-80">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          role="group"
          aria-label="Two-dimensional UMAP projection of summary embeddings"
        >
          {plotted.length === 0 && (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              className="fill-muted-foreground text-sm"
            >
              No plotted summaries in this selection.
            </text>
          )}
          {positioned.map((point) => {
            const color = topicColor(
              topics.findIndex((topic) => topic.id === point.topicId),
            );
            const isActive = active?.summaryId === point.summaryId;
            const select = () => {
              const deselect = selectedId === point.summaryId;
              setSelectedId(deselect ? null : point.summaryId);
              onSelectTrace?.(deselect ? null : point.traceId);
            };
            return (
              <circle
                key={point.summaryId}
                cx={point.x}
                cy={point.y}
                r={isActive ? 7 : 4.5}
                fill={color}
                fillOpacity={0.8}
                stroke={isActive ? "currentColor" : color}
                strokeWidth={isActive ? 2 : 0.8}
                strokeOpacity={1}
                role="button"
                tabIndex={point.summaryId === tabStopId ? 0 : -1}
                aria-label={`${point.traceId}: ${point.summary}`}
                aria-pressed={selectedId === point.summaryId}
                className="cursor-pointer focus:outline-2 focus:outline-offset-4"
                onClick={select}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select();
                  } else if (
                    [
                      "ArrowRight",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowUp",
                      "Home",
                      "End",
                    ].includes(event.key)
                  ) {
                    event.preventDefault();
                    const dots = Array.from(
                      event.currentTarget.ownerSVGElement?.querySelectorAll(
                        "circle",
                      ) ?? [],
                    );
                    const index = dots.indexOf(event.currentTarget);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? dots.length - 1
                          : (index +
                              (["ArrowRight", "ArrowDown"].includes(event.key)
                                ? 1
                                : -1) +
                              dots.length) %
                            dots.length;
                    dots[next]?.focus();
                  }
                }}
                onMouseEnter={() => setHoveredId(point.summaryId)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => {
                  setHoveredId(point.summaryId);
                  setFocusedId(point.summaryId);
                }}
                onBlur={() => setHoveredId(null)}
              >
                <title>
                  {point.traceId}: {point.summary}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-4 pb-3">
        <Button
          size="sm"
          variant={selectedTopic === null ? "secondary" : "ghost"}
          onClick={() => onSelectTopic(null)}
        >
          All topics
        </Button>
        {groups
          .filter((group) => group.count > 0)
          .map((group) => (
            <Button
              key={group.id}
              size="sm"
              variant={selectedTopic === group.id ? "secondary" : "ghost"}
              onClick={() =>
                onSelectTopic(selectedTopic === group.id ? null : group.id)
              }
              className="h-auto max-w-full gap-2 py-2 text-left whitespace-normal"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              {group.name}{" "}
              <span className="text-muted-foreground">{group.count}</span>
            </Button>
          ))}
      </div>
      <div className="bg-muted/20 border-t px-4 py-3" aria-live="polite">
        {active ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold" style={{ color: activeGroup?.color }}>
                {activeGroup?.name ?? "Unassigned"}
              </span>
              <Link
                href={`/project/${projectId}/traces/${encodeURIComponent(active.traceId)}`}
                title={active.traceId}
                className="max-w-full truncate font-mono underline"
              >
                {active.traceId} ↗
              </Link>
            </div>
            <p className="text-sm">{active.summary}</p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Hover or select a dot to read its summary. Use arrow keys to move
            between dots.
          </p>
        )}
      </div>
      {(data.unpositioned.length > 0 || data.missingSummaryCount > 0) && (
        <p className="text-muted-foreground border-t px-4 py-3 text-xs">
          {data.unpositioned.length > 0
            ? ` ${data.unpositioned.length} summaries in this execution have no coordinates in this map; they remain in the list below.`
            : ""}
          {data.missingSummaryCount > 0
            ? ` ${data.missingSummaryCount} original summaries are no longer available.`
            : ""}
        </p>
      )}
    </section>
  );
}
