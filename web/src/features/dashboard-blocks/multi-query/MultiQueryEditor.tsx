import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  multiQueryConfigSchema,
  type MultiQueryConfig,
} from "@langfuse/shared";
import {
  PlusIcon,
  TrashIcon,
  PauseIcon,
  PlayIcon,
  RefreshCw,
} from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  buildMultiQueryPlan,
  createMultiQueryConfig,
  type MultiQuerySource,
} from "./multiQueryModel";
import { MultiQueryResultView } from "./MultiQueryResultView";
import { formatDateRange } from "@/src/utils/date-range-utils";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { ChartTypePicker } from "./ChartTypePicker";
import { MultiQuerySourceEditor } from "./MultiQuerySourceEditor";
import {
  useMultiQueryWidget,
  type MultiQueryWidgetContext,
} from "./useMultiQueryWidget";

const resolveChart = zodResolver(multiQueryConfigSchema);

export function MultiQueryEditor({
  initial,
  projectId,
  dateRange,
  filterState,
  readPath,
  onSave,
  onCancel,
  savePending = false,
  saveError,
}: MultiQueryWidgetContext & {
  initial: MultiQueryConfig | undefined;
  onSave: (config: MultiQueryConfig) => void | Promise<void>;
  onCancel: () => void;
  savePending?: boolean;
  saveError?: string;
}) {
  const {
    watch,
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MultiQueryConfig>({
    defaultValues: initial ?? createMultiQueryConfig(),
    resolver: (values, context, options) =>
      resolveChart(values, context, { ...options }),
  });
  const config = watch();
  const [enabled, setEnabled] = useState(true);
  const [invalidSourceIds, setInvalidSourceIds] = useState<string[]>([]);
  const incompleteSources = config.queries.filter((source) =>
    invalidSourceIds.includes(source.id),
  );
  const [editing, setEditing] = useState(config.queries[0]!.id);
  const [mobileTab, setMobileTab] = useState("series");
  const capture = usePostHogClientCapture();
  const context = { projectId, dateRange, filterState, readPath };
  const runtime = useMultiQueryWidget(
    config,
    context,
    enabled && incompleteSources.length === 0,
  );
  const parsed = multiQueryConfigSchema.safeParse(config);
  const definitionError: string | null = (() => {
    try {
      if (parsed.success)
        buildMultiQueryPlan(config, {
          ...context,
          dateRange: dateRange ?? {
            from: new Date("2026-01-01T00:00:00Z"),
            to: new Date("2026-01-02T00:00:00Z"),
          },
        });
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Check the series configuration";
    }
    return null;
  })();
  const error =
    saveError ??
    errors.root?.save?.message ??
    (!parsed.success
      ? parsed.error.issues[0]?.message
      : (definitionError ?? runtime.validationError));
  const canSave =
    incompleteSources.length === 0 &&
    parsed.success &&
    !definitionError &&
    !runtime.validationError &&
    runtime.result.status === "complete" &&
    enabled &&
    !savePending;
  const track = (action: string, count?: number) =>
    capture("dashboard:block_interaction", {
      blockKind: "multiQuery",
      action,
      count,
      isV4: readPath === "v4",
    });
  const nextId = (prefix: string, existing: { id: string }[]) => {
    let index = 1;
    while (existing.some((item) => item.id === `${prefix}${index}`)) index++;
    return `${prefix}${index}`;
  };
  const updateQueries = (queries: MultiQuerySource[]) => {
    setInvalidSourceIds((current) =>
      current.filter((id) => queries.some((query) => query.id === id)),
    );
    const views = config.views
      ?.map((view) => ({
        ...view,
        queryIds: view.queryIds.filter((id) =>
          queries.some((query) => query.id === id),
        ),
      }))
      .filter((view) => view.queryIds.length > 0);
    setValue("queries", queries);
    setValue("views", views);
    if (!views?.some((view) => view.id === config.defaultViewId)) {
      setValue("defaultViewId", undefined);
    }
  };
  const save = handleSubmit(async (validated) => {
    if (!canSave) return;
    try {
      await onSave(validated);
    } catch {
      setError("root.save", {
        type: "server",
        message:
          "The chart could not be saved. Try again, or reload if someone else changed the dashboard.",
      });
    }
  });
  const previewContent = enabled ? (
    <MultiQueryResultView config={config} runtime={runtime} />
  ) : (
    <VisualizationFrame
      content={{
        type: "empty",
        message: "Preview paused",
        description: "Resume to load the latest series before saving.",
      }}
    />
  );
  return (
    <div className="ph-no-capture flex h-[min(75vh,54rem)] min-h-80 min-w-0 flex-col gap-3">
      <div className="md:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab}>
          <Tabs.List variant="inset" size="sm" aria-label="Chart editor areas">
            <Tabs.Trigger value="series" label="Series" />
            <Tabs.Trigger value="preview" label="Preview" />
          </Tabs.List>
        </Tabs>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[22rem_minmax(0,1fr)]">
        <div
          className={`${mobileTab === "series" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-3 overflow-y-auto md:flex`}
        >
          <label className="flex flex-col gap-1 text-xs">
            Title
            <Input
              aria-label="Chart title"
              {...register("title")}
              value={config.title}
              maxLength={200}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Description
            <Input
              aria-label="Chart description"
              {...register("description")}
              value={config.description}
              maxLength={10000}
            />
          </label>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Series · {config.queries.length}/5
            </h3>
            {config.queries.length < 5 ? (
              <Button
                text="Add series"
                icon={PlusIcon}
                variant="ghost"
                size="sm"
                onClick={() => {
                  const id = nextId("series_", config.queries);
                  updateQueries([
                    ...config.queries,
                    {
                      ...createMultiQueryConfig().queries[0]!,
                      id,
                      label: `Series ${String.fromCharCode(65 + config.queries.length)}`,
                    },
                  ]);
                  setEditing(id);
                  track("multi_query_series_added", config.queries.length + 1);
                }}
              />
            ) : null}
          </div>
          {config.queries.map((source, index) => (
            <MultiQuerySourceEditor
              key={source.id}
              source={source}
              index={index}
              context={context}
              expanded={source.id === editing}
              hasInvalidFilters={invalidSourceIds.includes(source.id)}
              onHasInvalidFiltersChange={(invalid) => {
                setInvalidSourceIds((current) => {
                  if (!invalid) return current.filter((id) => id !== source.id);
                  if (current.includes(source.id)) return current;
                  return [...current, source.id];
                });
              }}
              onExpandedChange={() =>
                setEditing(editing === source.id ? "" : source.id)
              }
              onChange={(next) =>
                updateQueries(
                  config.queries.map((query) =>
                    query.id === source.id ? next : query,
                  ),
                )
              }
              onDuplicate={
                config.queries.length < 5
                  ? () => {
                      const id = nextId("series_", config.queries);
                      updateQueries([
                        ...config.queries,
                        {
                          ...structuredClone(source),
                          id,
                          label: `${source.label} copy`,
                        },
                      ]);
                      setEditing(id);
                      track(
                        "multi_query_series_duplicated",
                        config.queries.length + 1,
                      );
                    }
                  : undefined
              }
              onRemove={
                config.queries.length > 1
                  ? () => {
                      updateQueries(
                        config.queries.filter(
                          (query) => query.id !== source.id,
                        ),
                      );
                      track(
                        "multi_query_series_removed",
                        config.queries.length - 1,
                      );
                    }
                  : undefined
              }
            />
          ))}
          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Saved views
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <p className="text-muted-foreground">
                Let viewers switch between named sets of series.
              </p>
              {(config.views ?? []).map((view, viewIndex) => (
                <div
                  key={view.id}
                  className="flex flex-col gap-2 rounded border p-2"
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label="View name"
                        value={view.label}
                        onChange={(event) =>
                          setValue(
                            `views.${viewIndex}.label`,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <IconButton
                      label="Remove view"
                      icon={TrashIcon}
                      size="sm"
                      onClick={() => {
                        setValue(
                          "views",
                          config.views?.filter((item) => item.id !== view.id),
                        );
                        if (config.defaultViewId === view.id)
                          setValue("defaultViewId", undefined);
                        track("multi_query_view_removed");
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1" aria-label="View series">
                    {config.queries.map((query) => (
                      <label
                        key={query.id}
                        className="flex min-w-0 items-center gap-2 text-xs"
                      >
                        <Checkbox
                          checked={view.queryIds.includes(query.id)}
                          onCheckedChange={(checked) => {
                            const queryIds = checked
                              ? [...view.queryIds, query.id]
                              : view.queryIds.filter((id) => id !== query.id);
                            setValue(`views.${viewIndex}.queryIds`, queryIds);
                            track(
                              "multi_query_view_series_changed",
                              queryIds.length,
                            );
                          }}
                        />
                        <span className="min-w-0 break-words">
                          {query.label || query.id}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {(config.views?.length ?? 0) < 8 ? (
                <Button
                  text="Add view"
                  icon={PlusIcon}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const view = {
                      id: nextId("view_", config.views ?? []),
                      label: `View ${(config.views?.length ?? 0) + 1}`,
                      queryIds: config.queries.map((query) => query.id),
                    };
                    setValue("views", [...(config.views ?? []), view]);
                    track("multi_query_view_added");
                  }}
                />
              ) : null}
              {config.views?.length ? (
                <SelectInput
                  noCapture
                  aria-label="Default view"
                  placeholder="All series"
                  value={config.defaultViewId ?? "all"}
                  options={[
                    { value: "all", label: "All series" },
                    ...config.views.map((view) => ({
                      value: view.id,
                      label: view.label || "Unnamed view",
                    })),
                  ]}
                  onValueChange={(value) => {
                    setValue(
                      "defaultViewId",
                      value === "all" ? undefined : value,
                    );
                    runtime.selectView(undefined);
                    track("multi_query_default_view_changed");
                  }}
                />
              ) : null}
            </div>
          </details>
          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Display options
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <label className="flex items-center justify-between gap-2">
                Rows per series
                <Input
                  aria-label="Rows per series"
                  type="number"
                  min={1}
                  max={1000}
                  value={config.display.rowLimit ?? 100}
                  onChange={(event) =>
                    setValue("display.rowLimit", Number(event.target.value))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                Histogram bins
                <Input
                  aria-label="Histogram bins"
                  type="number"
                  min={1}
                  max={100}
                  value={config.display.bins ?? 10}
                  onChange={(event) =>
                    setValue("display.bins", Number(event.target.value))
                  }
                />
              </label>
              <SelectInput
                aria-label="Legend"
                placeholder="Show legend"
                value={config.display.legend === false ? "hidden" : "visible"}
                options={[
                  { value: "visible", label: "Show legend" },
                  { value: "hidden", label: "Hide legend" },
                ]}
                onValueChange={(value) => {
                  setValue("display.legend", value === "visible");
                  track("multi_query_legend_visibility_changed");
                }}
              />
            </div>
          </details>
        </div>
        <div
          className={`${mobileTab === "preview" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-2 [--multi-query-plot-height:clamp(16rem,38vh,30rem)] md:flex`}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-sm font-bold">Live preview</h3>
              <p className="text-muted-foreground text-xs">
                {formatDateRange(runtime.dateRange.from, runtime.dateRange.to)}
              </p>
              {filterState.length > 0 && (
                <details className="text-muted-foreground text-xs">
                  <summary className="cursor-pointer">
                    Dashboard filters ({filterState.length})
                  </summary>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <InlineFilterState
                      filterState={filterState}
                      className="m-0"
                    />
                  </div>
                </details>
              )}
            </div>
            <div className="flex items-center gap-1">
              <ChartTypePicker
                value={config.display.chartType}
                onOpenChartType={() => track("multi_query_chart_type_opened")}
                onValueChange={(chartType) => {
                  setValue("display.chartType", chartType);
                  track("multi_query_chart_type_changed");
                }}
              />
              <Button
                text={enabled ? "Pause" : "Resume"}
                icon={enabled ? PauseIcon : PlayIcon}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEnabled(!enabled);
                  track(
                    enabled
                      ? "multi_query_preview_paused"
                      : "multi_query_preview_resumed",
                  );
                }}
              />
              <Button
                text="Refresh"
                icon={RefreshCw}
                variant="ghost"
                size="sm"
                disabled={!enabled}
                onClick={() => {
                  runtime.refresh();
                  track("multi_query_preview_refreshed");
                }}
              />
            </div>
          </div>
          {incompleteSources.length > 0 ? (
            <VisualizationFrame
              content={{
                type: "empty",
                message: "Complete the series filters",
                description:
                  "An incomplete filter has not been applied. Finish it or remove it before previewing or saving.",
              }}
            />
          ) : (
            previewContent
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-destructive shrink-0 text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t pt-3">
        <Button
          text="Cancel"
          variant="secondary"
          onClick={onCancel}
          disabled={savePending}
        />
        <Button
          text={initial ? "Save chart" : "Add chart"}
          variant="primary"
          onClick={save}
          disabled={!canSave}
          loading={savePending}
        />
      </div>
    </div>
  );
}
