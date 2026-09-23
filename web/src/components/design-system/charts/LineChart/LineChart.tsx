"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { scaleLinear, scalePoint, scaleUtc } from "d3-scale";
import { line } from "d3-shape";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import { CartesianChart } from "@/src/components/design-system/internal/charts/CartesianChart";
import { CartesianLayout } from "@/src/components/design-system/internal/charts/CartesianLayout";
import { ChartLegend } from "@/src/components/design-system/internal/charts/ChartLegend";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";

type LineChartValues = {
  values: Record<string, number | null>;
};

type TimeLineChartDatum = LineChartValues & { x: Date };
type CategoryLineChartDatum = LineChartValues & { x: string };

export type LineChartSeries = {
  id: string;
  label: string;
  color: string;
};

type ConfiguredLineChartSeries = LineChartSeries & {
  emphasis?: "default" | "dimmed" | "emphasized";
};

export type LineChartLegend =
  | { visibility: "hidden" }
  | ({
      visibility: "auto" | "visible";
      summary: "none" | "sum";
    } & (
      | { interaction: "highlight" }
      | { interaction: "toggle"; maxVisibleSeries?: number }
    ));

export type LineChartThreshold = {
  value: number;
  color: string;
  fillColor?: string;
  label?: string;
  region?: "above" | "below" | "equal" | "not-equal";
  lineStyle?: "solid" | "dashed";
};

type CommonLineChartProps = {
  series: LineChartSeries[];
  valueFormatter?: (value: number) => string;
  showDataPointDots?: boolean;
  connectNulls?: boolean;
  thresholds?: LineChartThreshold[];
  ariaLabel?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
  legend?: LineChartLegend;
};

type LineChartProps = CommonLineChartProps &
  (
    | {
        data: TimeLineChartDatum[];
        xAxis: {
          type: "time";
          tickFormatter?: (value: Date) => string;
          tooltipFormatter?: (value: Date) => string;
        };
      }
    | {
        data: CategoryLineChartDatum[];
        xAxis: {
          type: "category";
          labels?: "visible" | "hidden";
          tickFormatter?: (value: string) => string;
          tooltipFormatter?: (value: string) => string;
        };
      }
  );

type NormalizedDatum = LineChartValues & {
  key: string;
  x: Date | string;
};

const APPROX_TIME_TICK_WIDTH = 64;
const CATEGORY_TICK_GAP = 16;
const SERIES_HOVER_DISTANCE = 10;
const MAX_VISIBLE_POINT_RADIUS = 5;
const defaultValueFormatter = (value: number) => value.toLocaleString();

const getSeriesSummaries = (
  data: LineChartProps["data"],
  series: LineChartSeries[],
) =>
  new Map(
    series.map((item) => {
      const values = data.flatMap((datum) => {
        const value = datum.values[item.id];
        return typeof value === "number" && Number.isFinite(value)
          ? [value]
          : [];
      });
      return [
        item.id,
        values.length > 0
          ? values.reduce((total, value) => total + value, 0)
          : null,
      ] as const;
    }),
  );

const getInitiallyHiddenSeriesIds = (
  series: LineChartSeries[],
  summaries: Map<string, number | null>,
  legend: LineChartLegend | undefined,
) => {
  if (
    legend?.visibility === "hidden" ||
    legend?.interaction !== "toggle" ||
    legend.maxVisibleSeries === undefined
  ) {
    return new Set<string>();
  }
  const ranked = [...series].sort(
    (left, right) =>
      (summaries.get(right.id) ?? -Infinity) -
      (summaries.get(left.id) ?? -Infinity),
  );
  const visible = new Set(
    ranked
      .slice(0, Math.max(0, legend.maxVisibleSeries))
      .map((item) => item.id),
  );
  return new Set(
    series.flatMap((item) => (visible.has(item.id) ? [] : [item.id])),
  );
};

function useLineChartLegend(
  data: LineChartProps["data"],
  series: LineChartSeries[],
  legend: LineChartLegend | undefined,
) {
  const summaries = useMemo(
    () => getSeriesSummaries(data, series),
    [data, series],
  );
  const initialHidden = useMemo(
    () => getInitiallyHiddenSeriesIds(series, summaries, legend),
    [legend, series, summaries],
  );
  const legendInteraction =
    legend?.visibility === "auto" || legend?.visibility === "visible"
      ? legend.interaction
      : "";
  const maxVisibleSeries =
    (legend?.visibility === "auto" || legend?.visibility === "visible") &&
    legend.interaction === "toggle"
      ? (legend.maxVisibleSeries ?? "")
      : "";
  const seedKey = `${legend?.visibility ?? "hidden"}|${legendInteraction}|${maxVisibleSeries}|${JSON.stringify(series.map((item) => item.id).sort())}`;
  const [legendState, setLegendState] = useState({
    seedKey,
    highlightedSeriesId: undefined as string | undefined,
    hiddenSeriesIds: initialHidden,
  });
  const effectiveLegendState =
    legendState.seedKey === seedKey
      ? legendState
      : {
          seedKey,
          highlightedSeriesId: undefined,
          hiddenSeriesIds: initialHidden,
        };
  const { highlightedSeriesId, hiddenSeriesIds } = effectiveLegendState;

  const toggleSeries = (seriesId: string) => {
    const next = new Set(hiddenSeriesIds);
    if (next.has(seriesId)) next.delete(seriesId);
    else next.add(seriesId);
    setLegendState({ ...effectiveLegendState, hiddenSeriesIds: next });
  };
  const highlightSeries = (seriesId: string) => {
    setLegendState({
      ...effectiveLegendState,
      highlightedSeriesId:
        highlightedSeriesId === seriesId ? undefined : seriesId,
    });
  };
  const setAllSeriesHidden = (hidden: boolean) => {
    setLegendState({
      ...effectiveLegendState,
      hiddenSeriesIds: new Set(hidden ? series.map((item) => item.id) : []),
    });
  };
  const configuredSeries: ConfiguredLineChartSeries[] = series.flatMap(
    (item) => {
      if (hiddenSeriesIds.has(item.id)) return [];
      let emphasis: ConfiguredLineChartSeries["emphasis"] = "dimmed";
      if (highlightedSeriesId === undefined) emphasis = "default";
      else if (highlightedSeriesId === item.id) emphasis = "emphasized";
      return [
        {
          ...item,
          emphasis,
        },
      ];
    },
  );

  return {
    configuredSeries,
    hiddenSeriesIds,
    highlightedSeriesId,
    highlightSeries,
    summaries,
    setAllSeriesHidden,
    toggleSeries,
  };
}

const normalizeLineChartData = (
  data: LineChartProps["data"],
  xAxisType: LineChartProps["xAxis"]["type"],
) => {
  if (xAxisType === "time") {
    return data
      .map((datum) => ({
        ...datum,
        key: String(datum.x instanceof Date ? datum.x.getTime() : datum.x),
      }))
      .sort((left, right) => {
        const leftTime = left.x instanceof Date ? left.x.getTime() : Number.NaN;
        const rightTime =
          right.x instanceof Date ? right.x.getTime() : Number.NaN;
        return leftTime - rightTime;
      });
  }
  return data.map((datum) => ({
    ...datum,
    key: String(datum.x),
  }));
};

const getThresholdRegions = (
  threshold: LineChartThreshold,
  y: number,
  top: number,
  plotHeight: number,
) => {
  const epsilon = Math.max(plotHeight * 0.01, 2);
  if (threshold.region === "above") return [[top, y - top]];
  if (threshold.region === "below") {
    return [[y, top + plotHeight - y]];
  }
  if (threshold.region === "equal") return [[y - epsilon, epsilon * 2]];
  if (threshold.region === "not-equal") {
    return [
      [top, y - epsilon - top],
      [y + epsilon, top + plotHeight - y - epsilon],
    ];
  }
  return [];
};

export function LineChart(props: LineChartProps) {
  const {
    data,
    series,
    valueFormatter = defaultValueFormatter,
    legend,
  } = props;
  const [activeSeriesId, setActiveSeriesId] = useState<string>();
  const {
    configuredSeries,
    hiddenSeriesIds,
    highlightedSeriesId,
    highlightSeries,
    summaries,
    setAllSeriesHidden,
    toggleSeries,
  } = useLineChartLegend(data, series, legend);
  const showLegend =
    legend?.visibility === "visible" ||
    (legend?.visibility === "auto" && series.length > 1);

  return (
    <div className="flex size-full min-w-0 flex-col">
      <div className="min-h-0 flex-1">
        <ChartContainer>
          {({ width, height }) => (
            <CartesianLayout
              width={width}
              height={height}
              showXAxisLabels={
                props.xAxis.type !== "category" ||
                props.xAxis.labels !== "hidden"
              }
            >
              {(layout) => (
                <LineChartContent
                  {...props}
                  {...layout}
                  series={configuredSeries}
                  onActiveSeriesChange={setActiveSeriesId}
                  width={width}
                  height={height}
                />
              )}
            </CartesianLayout>
          )}
        </ChartContainer>
      </div>
      {showLegend ? (
        <ChartLegend
          selectionActions={
            legend.interaction === "toggle"
              ? {
                  allSelected: hiddenSeriesIds.size === 0,
                  onSelectAll: () => setAllSeriesHidden(false),
                  onDeselectAll: () => setAllSeriesHidden(true),
                }
              : undefined
          }
          items={series.map((item) => {
            const hidden = hiddenSeriesIds.has(item.id);
            const focused = highlightedSeriesId === item.id;
            let label = `Show only ${item.label}`;
            if (legend.interaction === "toggle") {
              label = hidden ? `Show ${item.label}` : `Hide ${item.label}`;
            } else if (focused) label = "Show all series";
            return {
              id: item.id,
              label: item.label,
              color: item.color,
              value:
                legend.summary === "sum" && summaries.get(item.id) !== null
                  ? {
                      label: "Sum",
                      value: valueFormatter(summaries.get(item.id) ?? 0),
                    }
                  : undefined,
              muted:
                hidden ||
                (activeSeriesId !== undefined
                  ? activeSeriesId !== item.id
                  : legend.interaction !== "toggle" &&
                    highlightedSeriesId !== undefined &&
                    !focused),
              action: {
                label,
                pressed: legend.interaction === "toggle" ? !hidden : focused,
                onClick: () => {
                  if (legend.interaction === "toggle") {
                    toggleSeries(item.id);
                    return;
                  }
                  highlightSeries(item.id);
                },
              },
            };
          })}
        />
      ) : null}
    </div>
  );
}

function LineChartContent(
  props: Omit<LineChartProps, "series"> & {
    series: ConfiguredLineChartSeries[];
    onActiveSeriesChange: (seriesId: string | undefined) => void;
    width: number;
    height: number;
    measuredPlot: { left: number; top: number; width: number; height: number };
    maxYTicks: number;
    plotForTicks: (labels: string[]) => {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  },
) {
  const {
    series,
    valueFormatter = defaultValueFormatter,
    showDataPointDots = false,
    connectNulls = false,
    thresholds = [],
    ariaLabel = "Line chart",
    sync,
    onActiveSeriesChange,
    width,
    height,
    xAxis,
    measuredPlot,
    maxYTicks,
    plotForTicks,
  } = props;
  const [hoveredIndex, setHoveredIndex] = useState<number>();
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string>();
  const showXAxisLabels =
    xAxis.type !== "category" || xAxis.labels !== "hidden";
  const plotHeight = measuredPlot.height;
  const yRangePadding = Math.min(MAX_VISIBLE_POINT_RADIUS, plotHeight / 2);

  const data = useMemo<NormalizedDatum[]>(
    () => normalizeLineChartData(props.data, props.xAxis.type),
    [props.data, props.xAxis.type],
  );

  const yScale = useMemo(() => {
    const values = data.flatMap((datum) =>
      series.flatMap((item) => {
        const value = datum.values[item.id];
        return typeof value === "number" && Number.isFinite(value)
          ? [value]
          : [];
      }),
    );
    values.push(...thresholds.map((threshold) => threshold.value));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    } else if (min === max) {
      const padding = Math.max(Math.abs(min) * 0.1, 1);
      min -= padding;
      max += padding;
    }
    if (min < 0) max = Math.max(0, max);
    return scaleLinear()
      .domain([min, max])
      .nice(maxYTicks)
      .range([
        measuredPlot.top + plotHeight - yRangePadding,
        measuredPlot.top + yRangePadding,
      ]);
  }, [
    data,
    maxYTicks,
    measuredPlot.top,
    plotHeight,
    series,
    thresholds,
    yRangePadding,
  ]);

  const yTicks = yScale.ticks(maxYTicks);
  const plot = plotForTicks(yTicks.map(valueFormatter));
  const LEFT_MARGIN = plot.left;
  const TOP_MARGIN = plot.top;
  const plotWidth = plot.width;

  const categoryScale = useMemo(
    () =>
      scalePoint<string>()
        .domain(data.map((datum) => datum.key))
        .range([LEFT_MARGIN, LEFT_MARGIN + plotWidth])
        .padding(data.length > 1 ? 0 : 0.5),
    [LEFT_MARGIN, data, plotWidth],
  );
  const timeScale = useMemo(() => {
    const timestamps = data.map((datum) =>
      datum.x instanceof Date ? datum.x.getTime() : Number.NaN,
    );
    let min = Math.min(...timestamps);
    let max = Math.max(...timestamps);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    return scaleUtc()
      .domain([new Date(min), new Date(max)])
      .range([LEFT_MARGIN, LEFT_MARGIN + plotWidth]);
  }, [LEFT_MARGIN, data, plotWidth]);
  const getX = (datum: NormalizedDatum) =>
    datum.x instanceof Date
      ? timeScale(datum.x)
      : (categoryScale(datum.key) ?? LEFT_MARGIN);
  const getXFromKey = (key: string) =>
    xAxis.type === "time"
      ? timeScale(new Date(Number(key)))
      : (categoryScale(key) ?? LEFT_MARGIN);

  const maxXTicks = Math.max(2, Math.floor(plotWidth / APPROX_TIME_TICK_WIDTH));
  const firstX = data[0]?.x;
  const lastX = data[data.length - 1]?.x;
  const xTicks =
    xAxis.type === "time"
      ? [
          ...(firstX instanceof Date ? [firstX] : []),
          ...timeScale.ticks(Math.max(0, maxXTicks - 2)).filter((value) => {
            const x = timeScale(value);
            return (
              x - LEFT_MARGIN >= APPROX_TIME_TICK_WIDTH &&
              LEFT_MARGIN + plotWidth - x >= APPROX_TIME_TICK_WIDTH
            );
          }),
          ...(lastX instanceof Date ? [lastX] : []),
        ]
          .filter(
            (value, index, ticks) =>
              ticks.findIndex(
                (candidate) => candidate.getTime() === value.getTime(),
              ) === index,
          )
          .sort((left, right) => left.getTime() - right.getTime())
          .map((value) => ({
            key: String(value.getTime()),
            x: timeScale(value),
            label: xAxis.tickFormatter?.(value) ?? value.toLocaleDateString(),
          }))
      : data.map((datum) => ({
          key: datum.key,
          x: getX(datum),
          label: xAxis.tickFormatter?.(String(datum.x)) ?? String(datum.x),
          maxWidth: plotWidth / Math.max(1, data.length) - CATEGORY_TICK_GAP,
        }));
  const activeKey =
    hoveredIndex === undefined ? sync?.activeKey : data[hoveredIndex]?.key;
  const activeDatum = data.find((datum) => datum.key === activeKey);
  const formatXAxisTick = (datum: NormalizedDatum) => {
    if (xAxis.type === "time" && datum.x instanceof Date) {
      return xAxis.tickFormatter?.(datum.x) ?? datum.x.toLocaleDateString();
    }
    if (xAxis.type === "category" && typeof datum.x === "string") {
      return xAxis.tickFormatter?.(datum.x) ?? datum.x;
    }
    return String(datum.x);
  };
  const activeXAxisTick = activeDatum
    ? {
        key: activeDatum.key,
        x: getX(activeDatum),
        label: formatXAxisTick(activeDatum),
      }
    : undefined;
  const visibleXTicks = activeXAxisTick
    ? [
        ...xTicks.filter((tick) => tick.key !== activeXAxisTick.key),
        { ...activeXAxisTick, maxWidth: undefined },
      ].sort((left, right) => left.x - right.x)
    : xTicks;
  const formatXTooltip = (datum: NormalizedDatum) => {
    if (xAxis.type === "time" && datum.x instanceof Date) {
      return xAxis.tooltipFormatter?.(datum.x) ?? datum.x.toLocaleString();
    }
    if (xAxis.type === "category" && typeof datum.x === "string") {
      return xAxis.tooltipFormatter?.(datum.x) ?? datum.x;
    }
    return String(datum.x);
  };
  const lineGenerator = line<NormalizedDatum>()
    .x((datum: NormalizedDatum) => getX(datum))
    .y((datum: NormalizedDatum) => yScale(Number(datum.values.__current)))
    .defined(
      (datum: NormalizedDatum) => typeof datum.values.__current === "number",
    );

  const findNearestSeries = (
    event: PointerEvent<SVGRectElement>,
    index: number,
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pointerY = event.clientY - svg.getBoundingClientRect().top;
    let distance = Infinity;
    let nearest: string[] = [];
    for (const item of series) {
      const value = data[index]?.values[item.id];
      if (typeof value !== "number") continue;
      const nextDistance = Math.abs(yScale(value) - pointerY);
      if (nextDistance < distance - 1) {
        distance = nextDistance;
        nearest = [item.id];
      } else if (Math.abs(nextDistance - distance) <= 1) {
        nearest.push(item.id);
      }
    }
    // Only emphasize an unambiguous nearby line. Empty space and overlapping
    // lines retain equal emphasis rather than selecting an arbitrary series.
    const nearestSeriesId =
      distance <= SERIES_HOVER_DISTANCE && nearest.length === 1
        ? nearest[0]
        : undefined;
    setHoveredSeriesId(nearestSeriesId);
    if (!hasConfiguredEmphasis) onActiveSeriesChange(nearestSeriesId);
  };
  const hasDistinctColors = series.some(
    (item) => item.color !== series[0]?.color,
  );
  const hasConfiguredEmphasis = series.some(
    (item) => item.emphasis && item.emphasis !== "default",
  );
  const configuredEmphasizedSeries = series.filter(
    (item) => item.emphasis === "emphasized",
  );
  let activeSeriesId: string | undefined;
  if (configuredEmphasizedSeries.length === 1) {
    activeSeriesId = configuredEmphasizedSeries[0]?.id;
  } else if (!hasConfiguredEmphasis) {
    activeSeriesId = hoveredSeriesId;
  }

  if (width <= 0 || height <= 0 || plotWidth <= 0 || plotHeight <= 0) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  return (
    <ChartTooltip>
      {({ activeIndex, getReferenceProps }) => (
        <CartesianChart
          width={width}
          height={height}
          ariaLabel={ariaLabel}
          plot={plot}
          yTicks={yTicks}
          y={yScale}
          valueFormatter={valueFormatter}
          categoryBoundaries={xAxis.type === "category"}
          zeroY={
            yScale.domain()[1] >= 0 &&
            data.some((datum) =>
              series.some((item) => (datum.values[item.id] ?? 0) < 0),
            )
              ? yScale(0)
              : undefined
          }
          xAxis={
            showXAxisLabels
              ? {
                  ticks: visibleXTicks,
                  activeKey,
                  showCategoryTicks: xAxis.type === "category",
                }
              : undefined
          }
        >
          {thresholds.map((threshold, index) => {
            const y = yScale(threshold.value);
            const regions = getThresholdRegions(
              threshold,
              y,
              TOP_MARGIN,
              plotHeight,
            );
            return (
              <g key={`${threshold.value}-${index}`}>
                {regions.map(([regionY, regionHeight], regionIndex) => (
                  <rect
                    key={regionIndex}
                    x={LEFT_MARGIN}
                    y={regionY}
                    width={plotWidth}
                    height={Math.max(0, regionHeight)}
                    fill={threshold.fillColor ?? threshold.color}
                    opacity={0.14}
                  />
                ))}
                <line
                  x1={LEFT_MARGIN}
                  x2={LEFT_MARGIN + plotWidth}
                  y1={y}
                  y2={y}
                  stroke={threshold.color}
                  strokeWidth={1.5}
                  strokeDasharray={
                    threshold.lineStyle === "dashed" ? "4 4" : undefined
                  }
                />
                {threshold.label ? (
                  <text
                    x={LEFT_MARGIN + plotWidth - 4}
                    y={y - 4}
                    textAnchor="end"
                    fill={threshold.color}
                    fontSize={11}
                  >
                    {threshold.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {series.map((item) => {
            const proximityDimmed =
              !hasConfiguredEmphasis &&
              hoveredSeriesId !== undefined &&
              hoveredSeriesId !== item.id;
            const proximityEmphasized =
              !hasConfiguredEmphasis && hoveredSeriesId === item.id;
            const seriesData = data.map((datum) => ({
              ...datum,
              values: { __current: datum.values[item.id] ?? null },
            }));
            const path = connectNulls
              ? lineGenerator(
                  seriesData.filter((datum) => datum.values.__current !== null),
                )
              : lineGenerator(seriesData);
            return (
              <g
                key={item.id}
                className="transition-opacity duration-150"
                opacity={
                  item.emphasis === "dimmed" || proximityDimmed ? 0.2 : 1
                }
              >
                <path
                  d={path ?? undefined}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={
                    item.emphasis === "emphasized" || proximityEmphasized
                      ? 3.5
                      : 2.5
                  }
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {seriesData.map((datum, index) => {
                  const value = datum.values.__current;
                  if (typeof value !== "number") return null;
                  const previous = seriesData[index - 1]?.values.__current;
                  const next = seriesData[index + 1]?.values.__current;
                  const isolated = previous == null && next == null;
                  const active = activeIndex === index;
                  const activeForSeries =
                    active &&
                    (activeSeriesId === undefined ||
                      activeSeriesId === item.id);
                  if (!showDataPointDots && !isolated && !activeForSeries)
                    return null;
                  return (
                    <circle
                      key={datum.key}
                      data-active-data-point={activeForSeries ? "" : undefined}
                      cx={getX(datum)}
                      cy={yScale(value)}
                      r={activeForSeries ? 5 : 4}
                      fill={item.color}
                      pointerEvents="none"
                    />
                  );
                })}
              </g>
            );
          })}

          {activeKey !== undefined ? (
            <line
              x1={getXFromKey(activeKey)}
              x2={getXFromKey(activeKey)}
              y1={TOP_MARGIN}
              y2={TOP_MARGIN + plotHeight}
              stroke="hsl(var(--foreground))"
              strokeDasharray="3 3"
              opacity={0.35}
              pointerEvents="none"
            />
          ) : null}

          {data.map((datum, index) => {
            const currentX = getX(datum);
            const left =
              index === 0
                ? LEFT_MARGIN
                : (getX(data[index - 1] ?? datum) + currentX) / 2;
            const right =
              index === data.length - 1
                ? LEFT_MARGIN + plotWidth
                : (currentX + getX(data[index + 1] ?? datum)) / 2;
            const values = series
              .flatMap((item) => {
                const value = datum.values[item.id];
                return typeof value === "number" ? [{ item, value }] : [];
              })
              .sort((left, right) => right.value - left.value);
            const first = values[0];
            if (!first) return null;
            const heading = formatXTooltip(datum);
            const tooltipItems = values.map(({ item, value }) => ({
              id: item.id,
              label: item.label,
              value: valueFormatter(value),
              color: hasDistinctColors ? item.color : undefined,
            }));
            const referenceProps = getReferenceProps({
              type: "items",
              index,
              heading,
              focusPoint: {
                x: currentX,
                y: TOP_MARGIN + plotHeight / 2,
              },
              emphasizedItemId:
                series.find((item) => item.emphasis === "emphasized")?.id ??
                (!hasConfiguredEmphasis ? hoveredSeriesId : undefined),
              items: tooltipItems,
            });
            return (
              <g key={datum.key}>
                <rect
                  x={left}
                  y={TOP_MARGIN}
                  width={Math.max(1, right - left)}
                  height={plotHeight}
                  fill="transparent"
                  {...referenceProps}
                  onPointerEnter={(event) => {
                    setHoveredIndex(index);
                    sync?.onActiveKeyChange(datum.key);
                    referenceProps.onPointerEnter(event);
                    findNearestSeries(event, index);
                  }}
                  onPointerMove={(event) => {
                    setHoveredIndex(index);
                    sync?.onActiveKeyChange(datum.key);
                    referenceProps.onPointerMove(event);
                    findNearestSeries(event, index);
                  }}
                  onPointerLeave={() => {
                    setHoveredIndex(undefined);
                    setHoveredSeriesId(undefined);
                    onActiveSeriesChange(undefined);
                    sync?.onActiveKeyChange(undefined);
                    referenceProps.onPointerLeave();
                  }}
                />
                {values.map(({ item, value }) => {
                  const focusReferenceProps = getReferenceProps({
                    type: "items",
                    index,
                    heading,
                    focusPoint: { x: currentX, y: yScale(value) },
                    emphasizedItemId: item.id,
                    items: tooltipItems,
                  });
                  return (
                    <circle
                      key={item.id}
                      cx={currentX}
                      cy={yScale(value)}
                      r={6}
                      fill="transparent"
                      pointerEvents="none"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={`${heading}: ${item.label} ${valueFormatter(value)}`}
                      {...focusReferenceProps}
                      onFocus={(event) => {
                        setHoveredIndex(index);
                        setHoveredSeriesId(item.id);
                        if (!hasConfiguredEmphasis)
                          onActiveSeriesChange(item.id);
                        focusReferenceProps.onFocus(event);
                      }}
                      onBlur={() => {
                        setHoveredIndex(undefined);
                        setHoveredSeriesId(undefined);
                        if (!hasConfiguredEmphasis)
                          onActiveSeriesChange(undefined);
                        focusReferenceProps.onBlur();
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
        </CartesianChart>
      )}
    </ChartTooltip>
  );
}
