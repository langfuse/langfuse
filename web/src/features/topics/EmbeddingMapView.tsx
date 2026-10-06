import { type ReactNode, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { useElementSize } from "@/src/hooks/useElementSize";
import type { RouterOutputs } from "@/src/utils/api";
import { topicColor } from "./topic-map-colors";

type Topic = Pick<
  RouterOutputs["topics"]["currentResults"][number]["topics"][number],
  "id" | "name"
>;
type MapData = Pick<
  RouterOutputs["topics"]["map"],
  "points" | "missingSummaryCount" | "unpositionedCount"
>;
const pointGroup = (point: MapData["points"][number]) =>
  point.outcome === "unassigned" ? "unassigned" : (point.topicId ?? "outliers");

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

export function EmbeddingMapView({
  projectId,
  data,
  topics,
  selectedTopic,
  onSelectTopic,
  headerActions,
  headerStats,
  onSelectTrace,
  selectedTraceId,
  onOpenTrace,
}: {
  projectId: string;
  data: MapData;
  topics: Topic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  headerActions?: ReactNode;
  headerStats?: ReactNode;
  onSelectTrace: (traceId: string | null) => void;
  selectedTraceId: string | null;
  onOpenTrace: (traceId: string) => void;
}) {
  const [plotRef, plotSize] = useElementSize<HTMLDivElement>();
  const width = plotSize?.width || 960;
  const height = plotSize?.height || 320;
  const plotted =
    selectedTopic === null
      ? data.points
      : data.points.filter((point) => pointGroup(point) === selectedTopic);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabStopId = plotted.some((point) => point.traceId === focusedId)
    ? focusedId
    : plotted[0]?.traceId;
  const active =
    plotted.find((point) => point.traceId === selectedTraceId) ??
    plotted.find((point) => point.traceId === hoveredId);
  const groups = [
    ...topics.map((topic, index) => ({
      id: topic.id,
      name: topic.name,
      color: topicColor(index),
    })),
    { id: "outliers", name: "Outliers", color: topicColor(-1) },
    { id: "unassigned", name: "Assignment unavailable", color: topicColor(-1) },
  ];
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
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="font-bold">Embedding map</h4>
            {headerStats}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            text="All topics"
            size="sm"
            variant={selectedTopic === null ? "secondary" : "ghost"}
            onClick={() => onSelectTopic(null)}
          />
          {headerActions}
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
            const isActive = active?.traceId === point.traceId;
            const select = () => {
              onSelectTrace(
                selectedTraceId === point.traceId ? null : point.traceId,
              );
            };
            return (
              <circle
                key={point.traceId}
                cx={point.x}
                cy={point.y}
                r={isActive ? 7 : 4.5}
                fill={color}
                fillOpacity={0.8}
                stroke={isActive ? "currentColor" : color}
                strokeWidth={isActive ? 2 : 0.8}
                strokeOpacity={1}
                role="button"
                tabIndex={point.traceId === tabStopId ? 0 : -1}
                aria-label={`${point.traceId}: ${point.summary}`}
                aria-pressed={selectedTraceId === point.traceId}
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
                    const direction = ["ArrowRight", "ArrowDown"].includes(
                      event.key,
                    )
                      ? 1
                      : -1;
                    let next = (index + direction + dots.length) % dots.length;
                    if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = dots.length - 1;
                    dots[next]?.focus();
                  }
                }}
                onMouseEnter={() => setHoveredId(point.traceId)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => {
                  setHoveredId(point.traceId);
                  setFocusedId(point.traceId);
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
      <div
        className="bg-muted/20 h-32 overflow-y-auto border-t px-4 py-3"
        aria-live="polite"
      >
        {active ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold" style={{ color: activeGroup?.color }}>
                {activeGroup?.name ?? "Unassigned"}
              </span>
              <TextLink
                path={`/project/${projectId}/traces/${encodeURIComponent(active.traceId)}`}
                value={active.traceId}
                onClick={() => onOpenTrace(active.traceId)}
              />
            </div>
            <p className="text-sm">{active.summary}</p>
          </>
        ) : null}
      </div>
      {(data.unpositionedCount > 0 || data.missingSummaryCount > 0) && (
        <p className="text-muted-foreground border-t px-4 py-3 text-xs">
          {data.unpositionedCount > 0
            ? ` ${data.unpositionedCount} current summaries have no coordinates in this map; they remain in the list below.`
            : ""}
          {data.missingSummaryCount > 0
            ? ` ${data.missingSummaryCount} original summaries are no longer available.`
            : ""}
        </p>
      )}
    </section>
  );
}

export const __test = { fitMapPoints };
