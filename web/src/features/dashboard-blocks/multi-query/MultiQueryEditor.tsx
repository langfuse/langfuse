import { useState } from "react";
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
import { ChartTypePicker } from "./ChartTypePicker";
import { MultiQuerySourceEditor } from "./MultiQuerySourceEditor";
import {
  useMultiQueryWidget,
  type MultiQueryWidgetContext,
} from "./useMultiQueryWidget";

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
  const [config, setConfig] = useState<MultiQueryConfig>(
    () => initial ?? createMultiQueryConfig(),
  );
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState(config.queries[0]!.id);
  const [mobileTab, setMobileTab] = useState("series");
  const [submitError, setSubmitError] = useState<string>();
  const capture = usePostHogClientCapture();
  const context = { projectId, dateRange, filterState, readPath };
  const runtime = useMultiQueryWidget(config, context, enabled);
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
    submitError ??
    (!parsed.success
      ? parsed.error.issues[0]?.message
      : (definitionError ?? runtime.validationError));
  const canSave =
    parsed.success &&
    !definitionError &&
    !runtime.validationError &&
    runtime.result.status === "complete" &&
    enabled &&
    !savePending;
  const track = (action: string, count?: number) =>
    capture("dashboard:block_interaction", {
      kind: "multi-query",
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
    const views = config.views
      ?.map((view) => ({
        ...view,
        queryIds: view.queryIds.filter((id) =>
          queries.some((query) => query.id === id),
        ),
      }))
      .filter((view) => view.queryIds.length > 0);
    setConfig({
      ...config,
      queries,
      views,
      defaultViewId: views?.some((view) => view.id === config.defaultViewId)
        ? config.defaultViewId
        : undefined,
    });
  };
  const save = async () => {
    if (!canSave || !parsed.success) return;
    setSubmitError(undefined);
    try {
      await onSave(parsed.data);
    } catch {
      setSubmitError(
        "The chart could not be saved. Try again, or reload if someone else changed the dashboard.",
      );
    }
  };
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
              value={config.title}
              maxLength={200}
              onChange={(event) =>
                setConfig({ ...config, title: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Description
            <Input
              aria-label="Chart description"
              value={config.description}
              maxLength={10000}
              onChange={(event) =>
                setConfig({ ...config, description: event.target.value })
              }
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
              {(config.views ?? []).map((view) => (
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
                          setConfig({
                            ...config,
                            views: config.views?.map((item) =>
                              item.id === view.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                    <IconButton
                      label="Remove view"
                      icon={TrashIcon}
                      size="sm"
                      onClick={() => {
                        setConfig({
                          ...config,
                          views: config.views?.filter(
                            (item) => item.id !== view.id,
                          ),
                          defaultViewId:
                            config.defaultViewId === view.id
                              ? undefined
                              : config.defaultViewId,
                        });
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
                            setConfig({
                              ...config,
                              views: config.views?.map((item) =>
                                item.id === view.id
                                  ? { ...item, queryIds }
                                  : item,
                              ),
                            });
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
                    setConfig({
                      ...config,
                      views: [...(config.views ?? []), view],
                    });
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
                    setConfig({
                      ...config,
                      defaultViewId: value === "all" ? undefined : value,
                    });
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
                    setConfig({
                      ...config,
                      display: {
                        ...config.display,
                        rowLimit: Number(event.target.value),
                      },
                    })
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
                    setConfig({
                      ...config,
                      display: {
                        ...config.display,
                        bins: Number(event.target.value),
                      },
                    })
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
                  setConfig({
                    ...config,
                    display: { ...config.display, legend: value === "visible" },
                  });
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
            <h3 className="text-sm font-bold">Live preview</h3>
            <div className="flex items-center gap-1">
              <ChartTypePicker
                value={config.display.chartType}
                onOpenChartType={() => track("multi_query_chart_type_opened")}
                onValueChange={(chartType) => {
                  setConfig({
                    ...config,
                    display: { ...config.display, chartType },
                  });
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
          {enabled ? (
            <MultiQueryResultView config={config} runtime={runtime} />
          ) : (
            <VisualizationFrame
              content={{
                type: "empty",
                message: "Preview paused",
                description: "Resume to load the latest series before saving.",
              }}
            />
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
