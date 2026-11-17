import { useState } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  StudioWidgetConfigSchema,
  type StudioQuery,
  type StudioWidgetConfig,
  type FilterState,
} from "@langfuse/shared";
import { PlayIcon, ChevronRightIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { StudioWidgetPreview } from "./StudioWidgetPreview";
import { useStudioWidgetResult } from "./useStudioWidgetResult";
import { StudioQueryWorkspace } from "./StudioQueryWorkspace";
import { StudioWidgetAppearance } from "./StudioWidgetAppearance";
import { createStudioQuery } from "./catalog";
import {
  useDashboardStudioCapture,
  type DashboardStudioEventProperties,
} from "./analytics";
import { resolveStudioQueryVersion, withStudioQueries } from "./studioConfig";
import {
  getStudioRenderConfig,
  hasStudioQueryChanges,
} from "./studioQueryConfig";
import { prepareStudioChart } from "./prepareStudioChart";

function nextStudioId(config: StudioWidgetConfig, kind: "query" | "formula") {
  const used = new Set(
    [...config.queries, ...config.expressions].map((item) => item.id),
  );
  if (kind === "query") {
    const letter = [..."abcdefghijklmnopqrstuvwxyz"].find(
      (id) => !used.has(id),
    );
    if (letter) return letter;
  }
  const prefix = kind === "query" ? "q" : "formula_";
  let index = 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

function changedQueryControl(
  previous: StudioQuery,
  next: StudioQuery,
): DashboardStudioEventProperties["controlId"] {
  if (previous.view !== next.view) return "source";
  const metrics = (query: StudioQuery) =>
    query.metrics.map((metric) => ({
      id: metric.id,
      measure: metric.measure,
      aggregation: metric.aggregation,
      percentile: metric.percentile,
      summary: metric.summary,
    }));
  if (JSON.stringify(metrics(previous)) !== JSON.stringify(metrics(next)))
    return "metric";
  if (JSON.stringify(previous.dimensions) !== JSON.stringify(next.dimensions))
    return "breakdown";
  if (
    JSON.stringify(previous.orderBy ?? []) !==
    JSON.stringify(next.orderBy ?? [])
  )
    return "sort";
  if ((previous.scoreTarget ?? "all") !== (next.scoreTarget ?? "all"))
    return "score_target";
  if (Boolean(previous.hidden) !== Boolean(next.hidden)) return "series";
  return undefined;
}

export function StudioWidgetEditor({
  initialValue,
  isNew,
  dashboardName,
  projectId,
  readPath,
  dateRange,
  filterState,
  onApply,
  onCancel,
}: StudioWidgetEditorProps) {
  const [config, setConfig] = useState(initialValue);
  const [preview, setPreview] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [mobileArea, setMobileArea] = useState("queries");
  const [invalidQueryIds, setInvalidQueryIds] = useState<string[]>([]);
  const invalidQueries = config.queries.filter((query) =>
    invalidQueryIds.includes(query.id),
  );
  const filterError = invalidQueries.length
    ? `Complete or remove incomplete filters in ${invalidQueries.map((query) => `query ${query.id.toUpperCase()}`).join(", ")} before running or applying.`
    : null;
  const isMobile = useIsMobile();
  const previewPending = hasStudioQueryChanges(config, preview);
  const renderConfig = getStudioRenderConfig(preview, config);
  const runtime = useStudioWidgetResult(preview, {
    projectId,
    readPath,
    dateRange,
    filterState,
  });
  const prepared = prepareStudioChart(runtime.result.data, renderConfig);
  const environmentOverrides = filterState.some(
    (filter) => filter.column === "environment",
  )
    ? preview.queries
        .filter((query) =>
          query.filters.some((filter) => filter.column === "environment"),
        )
        .map((query) => query.label || query.id)
    : [];
  const queryVersion = resolveStudioQueryVersion(
    config,
    readPath === "v4" ? "v2" : "v1",
    filterState,
  );
  const track = useDashboardStudioCapture(queryVersion === "v2");
  const metadata = {
    widgetKind: "query" as const,
    chartType: config.display.chartType,
    queryCount: config.queries.length,
    expressionCount: config.expressions.length,
    seriesCount: config.queries.reduce(
      (sum, query) => sum + query.metrics.length,
      0,
    ),
  };
  const validate = () => {
    if (filterError) {
      setError(filterError);
      return null;
    }
    const parsed = StudioWidgetConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(". "));
      return null;
    }
    setError(null);
    return parsed.data;
  };
  const appearance = (
    <StudioWidgetAppearance
      config={config}
      series={prepared.availableSeries}
      onChange={(next) => {
        setConfig(next);
        if (next.display !== config.display)
          track("configuration_changed", { ...metadata, scope: "display" });
      }}
      onChartTypeChange={(chartType) => {
        const timeSeries = chartType.endsWith("TIME_SERIES");
        setConfig({
          ...config,
          display: { ...config.display, chartType, timeSeries },
          queries: timeSeries
            ? config.queries
            : config.queries.map((query) => {
                const orderBy = query.orderBy?.filter(
                  (order) => order.field !== "time_dimension",
                );
                return {
                  ...query,
                  orderBy: orderBy?.length ? orderBy : undefined,
                };
              }),
        });
        track("configuration_changed", {
          ...metadata,
          chartType,
          scope: "display",
        });
      }}
      onHiddenSeriesChange={(hiddenSeriesIds) => {
        setConfig((current) => ({
          ...current,
          display: {
            ...current.display,
            hiddenSeriesIds: [
              ...(current.display.hiddenSeriesIds ?? []).filter(
                (id) =>
                  !prepared.availableSeries.some((series) => series.id === id),
              ),
              ...hiddenSeriesIds,
            ],
          },
        }));
        track("configuration_changed", { ...metadata, scope: "display" });
      }}
    />
  );
  const queries = (
    <StudioQueryWorkspace
      config={config}
      projectId={projectId}
      isV4={queryVersion === "v2"}
      dateRange={dateRange}
      filterState={filterState}
      environmentOverrides={environmentOverrides}
      invalidQueryIds={invalidQueryIds}
      onFilterValidityChange={(id, valid) =>
        setInvalidQueryIds((current) => {
          if (valid) return current.filter((item) => item !== id);
          return current.includes(id) ? current : [...current, id];
        })
      }
      onQueryChange={(id, next) => {
        const previous = config.queries.find((query) => query.id === id)!;
        if (previous.view !== next.view)
          setInvalidQueryIds((current) =>
            current.filter((item) => item !== id),
          );
        setConfig(
          withStudioQueries(
            config,
            config.queries.map((query) => (query.id === id ? next : query)),
          ),
        );
        const controlId = changedQueryControl(previous, next);
        if (controlId)
          track("configuration_changed", {
            ...metadata,
            controlId,
            ...(controlId === "score_target"
              ? { scoreTarget: next.scoreTarget ?? "all" }
              : {}),
            scope: "widget",
          });
        if (JSON.stringify(next.filters) !== JSON.stringify(previous.filters))
          track("filter_applied", {
            ...metadata,
            filterCount: next.filters.length,
            scope: "widget",
          });
      }}
      onQueryRemove={(id) => {
        setInvalidQueryIds((current) => current.filter((item) => item !== id));
        setConfig(
          withStudioQueries(
            config,
            config.queries.filter((query) => query.id !== id),
          ),
        );
        track("series_removed", {
          ...metadata,
          controlId: "series",
          queryCount: config.queries.length - 1,
        });
      }}
      onQueryDuplicate={(query) => {
        const id = nextStudioId(config, "query");
        setConfig({
          ...config,
          queries: [
            ...config.queries,
            { ...structuredClone(query), id, label: `${query.label} copy` },
          ],
        });
        track("series_added", {
          ...metadata,
          controlId: "series",
          queryCount: config.queries.length + 1,
        });
      }}
      onQueryAdd={() => {
        setConfig({
          ...config,
          queries: [
            ...config.queries,
            createStudioQuery(nextStudioId(config, "query")),
          ],
        });
        track("series_added", {
          ...metadata,
          controlId: "series",
          queryCount: config.queries.length + 1,
        });
      }}
      onFormulaChange={(expression) => {
        const previous = config.expressions.find(
          (item) => item.id === expression.id,
        );
        setConfig({
          ...config,
          expressions: config.expressions.map((item) =>
            item.id === expression.id ? expression : item,
          ),
        });
        if (previous?.unit !== expression.unit)
          track("configuration_changed", {
            ...metadata,
            scope: "display",
            controlId: "formula",
          });
      }}
      onFormulaRemove={(id) => {
        setConfig({
          ...config,
          expressions: config.expressions.filter((item) => item.id !== id),
        });
        track("series_removed", {
          ...metadata,
          controlId: "formula",
          expressionCount: config.expressions.length - 1,
        });
      }}
      onFormulaAdd={() => {
        setConfig({
          ...config,
          expressions: [
            ...config.expressions,
            {
              id: nextStudioId(config, "formula"),
              label: "Calculated metric",
              formula: `${config.queries[0]?.id}.${config.queries[0]?.metrics[0]?.id}`,
            },
          ],
        });
        track("series_added", {
          ...metadata,
          controlId: "formula",
          expressionCount: config.expressions.length + 1,
        });
      }}
    />
  );
  const result = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {previewPending ? (
        <p
          role="status"
          className="bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
        >
          Preview shows the last run. Run preview to include your query changes.
        </p>
      ) : null}
      <StudioWidgetPreview
        config={renderConfig}
        runtime={runtime}
        prepared={prepared}
      />
    </div>
  );
  return (
    <section
      aria-label="Widget editor"
      className="ph-no-capture bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:flex-1">
          <span
            title={dashboardName}
            className="text-muted-foreground max-w-40 truncate text-xs"
          >
            {dashboardName}
          </span>
          <ChevronRightIcon color="tertiary" aria-hidden />
          <h1
            title={isNew ? "New chart" : config.title || "Edit widget"}
            className="min-w-0 truncate text-sm font-bold"
          >
            {isNew ? "New chart" : config.title || "Edit widget"}
          </h1>
          {previewPending ? (
            <Badge text="Preview out of date" color="warning" />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button text="Cancel" variant="ghost" onClick={onCancel} />
          <Button
            text="Run preview"
            icon={PlayIcon}
            variant="outline"
            disabled={Boolean(filterError)}
            loading={runtime.result.isFetching}
            onClick={() => {
              const next = validate();
              if (next) {
                setPreview(next);
                if (!hasStudioQueryChanges(next, preview))
                  runtime.result.refetch();
                track("configuration_changed", {
                  ...metadata,
                  scope: "widget",
                });
              }
            }}
          />
          <Button
            text={isNew ? "Add to dashboard" : "Apply changes"}
            disabled={Boolean(filterError)}
            onClick={() => {
              const next = validate();
              if (next) {
                onApply(next);
                track("widget_saved", metadata);
              }
            }}
          />
        </div>
        <p className="text-muted-foreground w-full text-[11px]">
          Changes apply to the dashboard draft. Save the dashboard to publish
          them.
        </p>
      </div>
      {filterError ? (
        <p
          role="status"
          className="bg-destructive/5 text-destructive shrink-0 border-b px-4 py-2 text-xs"
        >
          {filterError}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="bg-destructive/5 text-destructive shrink-0 border-b px-4 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <ResizablePanelGroup orientation="vertical" className="min-h-0 min-w-0">
          <ResizablePanel
            id="widget-preview"
            defaultSize="50%"
            minSize="200px"
            className="min-h-0 min-w-0"
          >
            {result}
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize preview and queries" />
          <ResizablePanel
            id="widget-queries"
            minSize="180px"
            className="flex min-h-0 min-w-0 flex-col"
          >
            <Tabs
              value={isMobile ? mobileArea : "queries"}
              layout="fill"
              onValueChange={(value) => {
                if (value === mobileArea) return;
                setMobileArea(value);
                track("view_changed", {
                  ...metadata,
                  scope: "widget",
                  target:
                    value === "queries"
                      ? "configuration_data"
                      : "configuration_visualization",
                });
              }}
            >
              {isMobile ? (
                <Tabs.List variant="underline" aria-label="Editor areas">
                  <Tabs.Trigger value="queries" label="Queries" />
                  <Tabs.Trigger value="appearance" label="Appearance" />
                </Tabs.List>
              ) : null}
              <TabsPrimitive.Content
                forceMount
                value="queries"
                className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              >
                {queries}
              </TabsPrimitive.Content>
              <TabsPrimitive.Content
                value="appearance"
                className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              >
                {isMobile ? appearance : null}
              </TabsPrimitive.Content>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
        <div className="hidden min-h-0 min-w-0 border-l md:block">
          {isMobile ? null : appearance}
        </div>
      </div>
    </section>
  );
}

type StudioWidgetEditorProps = {
  initialValue: StudioWidgetConfig;
  isNew: boolean;
  dashboardName: string;
  projectId: string;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  onApply: (config: StudioWidgetConfig) => void;
  onCancel: () => void;
};
