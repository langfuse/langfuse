import { type ReactNode, useEffect, useState } from "react";
import {
  StudioWidgetConfigSchema,
  type StudioQuery,
  type StudioWidgetConfig,
  type FilterState,
} from "@langfuse/shared";
import { CalendarDays } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { InlineEditText } from "@/src/components/design-system/InlineEditText/InlineEditText";
import { cn } from "@/src/utils/tailwind";
import { formatDateRange } from "@/src/utils/date-range-utils";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { useStudioQueryView } from "./useStudioQueryView";
import { StudioCalculationPreview } from "./StudioCalculationPreview";
import { StudioWidgetPreview } from "./StudioWidgetPreview";
import { useStudioWidgetResult } from "./useStudioWidgetResult";
import { StudioQueryWorkspace } from "./StudioQueryWorkspace";
import {
  applyStudioSeriesVisibility,
  createStudioFormulaOperands,
  studioAuthoringError,
} from "./studioFormulaAuthoring";
import { StudioWidgetAppearance } from "./StudioWidgetAppearance";
import { createStudioQuery } from "./catalog";
import {
  useDashboardStudioCapture,
  type DashboardStudioEventProperties,
} from "./analytics";
import { resolveStudioQueryVersion, withStudioQueries } from "./studioConfig";
import {
  getStudioRenderConfig,
  canPreviewStudioFormulasLocally,
  getStudioApplyBlockReason,
  hasStudioQueryChanges,
} from "./studioQueryConfig";
import { prepareStudioChart } from "./prepareStudioChart";
import { validateCurrentStudioConfig } from "./currentStudioExecution";

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
  active = true,
  applyContext = "dashboard",
  renderEditorOptions,
}: StudioWidgetEditorProps) {
  const [config, setConfig] = useState(initialValue);
  const [preview, setPreview] = useState(initialValue);
  const [expandedId, setExpandedId] = useState<string | null>(
    () =>
      initialValue.expressions.find((item) => !item.hidden)?.id ??
      initialValue.queries.find((query) =>
        initialValue.display.activeQueryIds?.includes(query.id),
      )?.id ??
      initialValue.queries.find((query) => !query.hidden)?.id ??
      initialValue.queries[0]?.id ??
      null,
  );
  const [mobileArea, setMobileArea] = useState<"series" | "preview">("series");
  const [invalidQueryIds, setInvalidQueryIds] = useState<string[]>([]);
  const invalidQueries = config.queries.filter((query) =>
    invalidQueryIds.includes(query.id),
  );
  const filterError = invalidQueries.length
    ? `Complete or remove the unfinished filters in ${invalidQueries.map((query) => query.label || query.id).join(", ")} to update the preview.`
    : null;
  const previewPending = hasStudioQueryChanges(config, preview);
  const renderConfig = getStudioRenderConfig(preview, config);
  const { displayed, picker, resetView } = useStudioQueryView(
    renderConfig,
    "editor",
    setExpandedId,
  );
  const context = { projectId, readPath, dateRange, filterState };
  const defaultResult = useStudioWidgetResult(preview, {
    ...context,
    enabled: active,
  });
  const viewingAlternate = displayed !== renderConfig;
  const alternateResult = useStudioWidgetResult(displayed, {
    ...context,
    enabled: active && viewingAlternate,
  });
  const runtime = viewingAlternate ? alternateResult : defaultResult;
  // A temporary series selection can never validate a different saved default.
  const previewApplyBlockReason =
    getStudioApplyBlockReason(config, preview, defaultResult.result) ??
    (viewingAlternate
      ? getStudioApplyBlockReason(preview, preview, runtime.result)
      : null);
  const prepared = prepareStudioChart(runtime.result.data, displayed);
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
  const currentCapabilities = config.executionMode === "current";
  const capabilityValidation = currentCapabilities
    ? validateCurrentStudioConfig(config, queryVersion)
    : { valid: true as const };
  const unselectedScore = config.queries.find(
    (query) =>
      query.view.startsWith("scores-") &&
      !query.dimensions.some((dimension) => dimension.field === "name") &&
      !query.filters.some(
        (filter) =>
          ["name", "scoreName", "configId"].includes(filter.column) &&
          (typeof filter.value === "string"
            ? Boolean(filter.value.trim())
            : Array.isArray(filter.value) && filter.value.length > 0),
      ),
  );
  const scoreDefinitionReason = unselectedScore
    ? `Choose a score definition in ${unselectedScore.label || unselectedScore.id} to preview this series.`
    : null;
  const schema = StudioWidgetConfigSchema.safeParse(config);
  const formulaError = !currentCapabilities
    ? config.expressions
        .map((expression, index) =>
          studioAuthoringError(
            expression.formula,
            createStudioFormulaOperands(
              config.queries,
              config.expressions.slice(0, index),
              queryVersion === "v2",
            ),
          ),
        )
        .find(Boolean)
    : null;
  const message =
    filterError ??
    scoreDefinitionReason ??
    (capabilityValidation.valid ? formulaError : capabilityValidation.reason) ??
    (schema.success ? null : schema.error.issues[0]?.message);
  const applyBlockReason = message ?? previewApplyBlockReason;
  // Coalesce edits before committing a valid query shape to the request scheduler.
  useEffect(() => {
    if (!active || !previewPending || message) return;
    const timer = window.setTimeout(() => setPreview(config), 350);
    return () => window.clearTimeout(timer);
  }, [active, config, message, previewPending]);
  const track = useDashboardStudioCapture(queryVersion === "v2");
  const newApplyLabel =
    applyContext === "report" ? "Add to report" : "Add to dashboard";
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
  const appearance = (
    <StudioWidgetAppearance
      config={config}
      experimental={!currentCapabilities}
      series={prepared.availableSeries}
      onOpenChartType={() =>
        track("view_changed", {
          ...metadata,
          scope: "display",
          target: "chart_type",
        })
      }
      onOpenSettings={() =>
        track("view_changed", {
          ...metadata,
          scope: "widget",
          target: "configuration_visualization",
        })
      }
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
  const updateCalculations = (
    expressions: StudioWidgetConfig["expressions"],
  ) => {
    const next = { ...config, expressions };
    setConfig(next);
    if (
      !filterError &&
      !scoreDefinitionReason &&
      defaultResult.result.data?.status === "complete" &&
      canPreviewStudioFormulasLocally(next, preview, queryVersion)
    ) {
      setPreview(next);
    }
  };
  const queries = (
    <StudioQueryWorkspace
      config={config}
      expandedId={expandedId}
      onExpand={setExpandedId}
      executionMode={currentCapabilities ? "current" : "prototype"}
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
      onDefaultQueryIdsChange={(activeQueryIds) => {
        resetView();
        setConfig((current) => ({
          ...current,
          display: { ...current.display, activeQueryIds },
        }));
        track("configuration_changed", {
          ...metadata,
          controlId: "series",
          target: "configuration_data",
          scope: "widget",
          selectedCount: activeQueryIds?.length ?? config.queries.length,
        });
      }}
      onSeriesVisibilityChange={(visibility, interaction) => {
        resetView();
        setConfig((current) =>
          applyStudioSeriesVisibility(current, visibility),
        );
        track("configuration_changed", {
          ...metadata,
          controlId: "formula",
          scope: "display",
          interaction,
        });
      }}
      onFormulaCommit={() =>
        track("configuration_changed", {
          ...metadata,
          controlId: "formula",
          scope: "widget",
          interaction: "apply",
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
        setExpandedId(id);
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
        const id = nextStudioId(config, "query");
        setExpandedId(id);
        setConfig({
          ...config,
          queries: [...config.queries, createStudioQuery(id)],
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
        updateCalculations(
          config.expressions.map((item) =>
            item.id === expression.id ? expression : item,
          ),
        );
        if (
          previous?.unit !== expression.unit ||
          Boolean(previous?.hidden) !== Boolean(expression.hidden)
        )
          track("configuration_changed", {
            ...metadata,
            scope: "display",
            controlId: "formula",
          });
      }}
      onFormulaRemove={(id) => {
        updateCalculations(config.expressions.filter((item) => item.id !== id));
        track("series_removed", {
          ...metadata,
          controlId: "formula",
          expressionCount: config.expressions.length - 1,
        });
      }}
      onFormulaAdd={() => {
        const id = nextStudioId(config, "formula");
        setExpandedId(id);
        updateCalculations([
          ...config.expressions,
          {
            id,
            label: "Computed series",
            formula: `${config.queries[0]?.id}.${config.queries[0]?.metrics[0]?.id}`,
          },
        ]);
        track("series_added", {
          ...metadata,
          controlId: "formula",
          expressionCount: config.expressions.length + 1,
        });
      }}
    />
  );
  const hasCalculation = displayed.expressions.some(
    (expression) => !expression.hidden,
  );
  const panelCount = prepared.unitPanels.length;
  const failed = (result: typeof runtime.result) =>
    result.isError ||
    result.data?.status === "partial" ||
    result.data?.status === "error";
  const failedDefault = failed(defaultResult.result);
  const failedAlternate = viewingAlternate && failed(runtime.result);
  const updating =
    !message &&
    (previewPending ||
      runtime.result.isPending ||
      runtime.result.isFetching ||
      defaultResult.result.isFetching);
  return (
    <section
      aria-label="Widget editor"
      className="ph-no-capture bg-background @container/editor flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <header className="border-border/40 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 @min-[860px]/editor:px-6">
        <div className="min-w-0 basis-full @min-[660px]/editor:flex-1">
          <p
            title={dashboardName}
            className="text-muted-foreground mb-1 truncate text-xs"
          >
            {dashboardName}
          </p>
          <h1 className="-ml-1 min-w-0 text-lg font-bold tracking-tight">
            <InlineEditText
              aria-label="Edit chart title"
              value={config.title}
              placeholder="Untitled chart"
              required
              onSave={(title) => setConfig({ ...config, title })}
            />
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {renderEditorOptions?.(config, setConfig)}
          <Button text="Cancel" variant="ghost" onClick={onCancel} />
          <Button
            text={isNew ? newApplyLabel : "Apply changes"}
            disabled={Boolean(applyBlockReason)}
            onClick={() => {
              if (applyBlockReason || !schema.success) return;
              onApply(schema.data);
              track("widget_saved", metadata);
            }}
          />
        </div>
      </header>
      {message ? (
        <p
          role="alert"
          className="bg-destructive/5 text-destructive border-b px-5 py-2 text-xs"
        >
          {message}
        </p>
      ) : null}
      <div
        className="flex shrink-0 gap-1 px-3 py-1.5 @min-[860px]/editor:hidden"
        role="group"
        aria-label="Editor panels"
      >
        {(["series", "preview"] as const).map((area) => (
          <Button
            key={area}
            size="sm"
            text={area === "series" ? "Series" : "Preview"}
            variant={mobileArea === area ? "secondary" : "ghost"}
            aria-pressed={mobileArea === area}
            onClick={() => {
              setMobileArea(area);
              track("view_changed", {
                ...metadata,
                scope: "widget",
                target: area === "series" ? "configuration_data" : "chart",
              });
            }}
          />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 @min-[860px]/editor:grid-cols-[clamp(23rem,34%,28rem)_minmax(0,1fr)]">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col @min-[860px]/editor:flex",
            mobileArea === "series" ? "flex" : "hidden",
          )}
        >
          {queries}
        </div>
        <section
          aria-label="Chart preview"
          className={cn(
            "bg-background min-h-0 min-w-0 flex-col overflow-y-auto px-4 pb-5 @min-[860px]/editor:flex @min-[860px]/editor:px-6",
            mobileArea === "preview" ? "flex" : "hidden",
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-bold">
                {message && previewPending ? "Last valid preview" : "Preview"}
              </h2>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <CalendarDays size="sm" aria-hidden />
                {formatDateRange(dateRange.from, dateRange.to)}
              </span>
              <span role="status" className="text-muted-foreground text-xs">
                {updating ? "Updating…" : null}
              </span>
            </div>
            {appearance}
          </div>
          {!message && !updating && (failedDefault || failedAlternate) ? (
            <div
              role="status"
              className="text-muted-foreground mb-2 flex items-center gap-2 text-xs"
            >
              {previewApplyBlockReason}
              <Button
                text="Retry preview"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (failedDefault) defaultResult.result.refetch();
                  if (failedAlternate) runtime.result.refetch();
                }}
              />
            </div>
          ) : null}
          <div
            style={
              panelCount > 1
                ? { minHeight: `${7 + panelCount * 13}rem` }
                : undefined
            }
            className={cn(
              "flex min-w-0 flex-col overflow-hidden",
              hasCalculation
                ? "h-[clamp(19rem,45dvh,34rem)] min-h-64 shrink-0"
                : "min-h-72 flex-1",
            )}
          >
            <StudioWidgetPreview
              config={displayed}
              runtime={runtime}
              prepared={prepared}
              queryView={picker}
            />
          </div>
          {hasCalculation && runtime.result.data?.status === "complete" ? (
            <div className="mt-3 shrink-0">
              <StudioCalculationPreview
                config={displayed}
                result={runtime.result.data}
                isV4={runtime.version === "v2"}
                expressionId={expandedId ?? undefined}
                onSelectExpression={setExpandedId}
              />
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

type StudioWidgetEditorProps = {
  renderEditorOptions?: (
    config: StudioWidgetConfig,
    onChange: (next: StudioWidgetConfig) => void,
  ) => ReactNode;
  active?: boolean;
  applyContext?: "dashboard" | "report";
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
