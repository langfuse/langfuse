import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  multiQueryConfigV2Schema,
  multiQueryTabSchema,
  normalizeMultiQueryConfig,
  multiQueryTabAsChart,
  type MultiQueryConfigV2,
  type MultiQueryTab,
  type SavedMultiQueryConfig,
} from "@langfuse/shared/dashboards";
import {
  PlusIcon,
  PauseIcon,
  PlayIcon,
  RefreshCw,
  EllipsisVertical,
} from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { formatDateRange } from "@/src/utils/date-range-utils";
import { buildMultiQueryPlan, createMultiQueryConfig } from "./multiQueryModel";
import { MultiQueryResultView } from "./MultiQueryResultView";
import { ChartTypePicker } from "./ChartTypePicker";
import { MultiQueryTabSources } from "./MultiQueryTabSources";
import {
  createEditorTab,
  nextEditorId,
  incompatibleTabUnits,
  splitMultiQueryTabByUnit,
  unitName,
} from "./multiQueryTabEditing";
import {
  useMultiQueryWidget,
  type MultiQueryWidgetContext,
} from "./useMultiQueryWidget";

const noInvalidSources: ReadonlySet<string> = new Set();

export function MultiQueryEditor({
  initial,
  initialTabId,
  projectId,
  dateRange,
  filterState,
  readPath,
  onSave,
  onCancel,
  savePending = false,
  saveError,
}: MultiQueryWidgetContext & {
  initial: SavedMultiQueryConfig | undefined;
  initialTabId?: string;
  onSave: (
    config: MultiQueryConfigV2,
    activeTabId: string,
  ) => void | Promise<void>;
  onCancel: () => void;
  savePending?: boolean;
  saveError?: string;
}) {
  const [initialDraft] = useState(() =>
    normalizeMultiQueryConfig(initial ?? createMultiQueryConfig()),
  );
  const { watch, setValue } = useForm<MultiQueryConfigV2>({
    defaultValues: initialDraft,
  });
  const config = watch();
  const [tabId, setTabId] = useState(
    () =>
      initialDraft.tabs.find((tab) => tab.id === initialTabId)?.id ??
      initialDraft.tabs[0]!.id,
  );
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set([tabId]),
  );
  const [invalidFilters, setInvalidFilters] = useState<
    Map<string, ReadonlySet<string>>
  >(() => new Map());
  const [unverified, setUnverified] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [enabled, setEnabled] = useState(true);
  const [mobileArea, setMobileArea] = useState("series");
  const [submitError, setSubmitError] = useState("");
  const capture = usePostHogClientCapture();
  const active = config.tabs.find((t) => t.id === tabId) ?? config.tabs[0]!;
  const context = { projectId, dateRange, filterState, readPath };
  const activeFiltersComplete = !invalidFilters.get(active.id)?.size;
  const runtime = useMultiQueryWidget(
    active,
    context,
    enabled && activeFiltersComplete,
  );
  const plotUnits = incompatibleTabUnits(active, readPath);
  const schema = multiQueryConfigV2Schema.safeParse(config);
  const firstInvalidTab = config.tabs.find(
    (t) => invalidFilters.get(t.id)?.size,
  );
  const schemaIssue = !schema.success ? schema.error.issues[0] : undefined;
  const schemaTab =
    schemaIssue?.path[0] === "tabs" && typeof schemaIssue.path[1] === "number"
      ? config.tabs[schemaIssue.path[1]]
      : undefined;
  const mixedTab = config.tabs.find(
    (t) => incompatibleTabUnits(t, readPath).length > 1,
  );
  const checkedTab =
    enabled &&
    activeFiltersComplete &&
    !runtime.validationError &&
    runtime.result.status === "complete";
  const inactivePending = config.tabs.find(
    (t) => t.id !== active.id && unverified.has(t.id),
  );
  const definitionError = (() => {
    if (!schema.success) return;
    for (const tab of config.tabs) {
      try {
        buildMultiQueryPlan(multiQueryTabAsChart(tab), {
          ...context,
          dateRange: runtime.dateRange,
        });
      } catch (error) {
        return {
          tab,
          message:
            error instanceof Error
              ? error.message
              : "Check the series configuration",
        };
      }
    }
  })();
  const error =
    saveError ||
    submitError ||
    (firstInvalidTab
      ? "Finish or remove the incomplete filter."
      : (schemaIssue?.message ??
        definitionError?.message ??
        runtime.validationError));
  const errorTab = firstInvalidTab ?? schemaTab ?? definitionError?.tab;
  const reviewTab = [errorTab, mixedTab, inactivePending].find(
    (tab) => tab && tab.id !== active.id,
  );
  const canSave =
    checkedTab &&
    schema.success &&
    !firstInvalidTab &&
    !definitionError &&
    !mixedTab &&
    !inactivePending &&
    !savePending;
  const track = (action: string, count?: number) =>
    capture("dashboard:block_interaction", {
      blockKind: "multiQuery",
      action,
      count,
      isV4: readPath === "v4",
    });
  const changeTab = (tab: MultiQueryTab) =>
    setValue(
      "tabs",
      config.tabs.map((t) => (t.id === tab.id ? tab : t)),
    );
  const select = (id: string) => {
    const savedTab =
      initial && initialDraft.tabs.find((t) => t.id === active.id);
    const unchanged =
      savedTab && JSON.stringify(savedTab) === JSON.stringify(active);
    setUnverified((prev) => {
      const next = new Set(prev);
      if (checkedTab || unchanged) next.delete(active.id);
      else next.add(active.id);
      return next;
    });
    setTabId(id);
    setVisited((prev) => new Set([...prev, id]));
    track("multi_query_tab_selected");
  };
  const add = (duplicate = false) => {
    const id = nextEditorId("tab", config.tabs);
    const tab = duplicate
      ? {
          ...structuredClone(active),
          id,
          label: (active.label + " copy").slice(0, 200),
        }
      : createEditorTab(id, "Tab " + (config.tabs.length + 1));
    setValue("tabs", [...config.tabs, tab]);
    select(id);
    track(
      duplicate ? "multi_query_tab_duplicated" : "multi_query_tab_added",
      config.tabs.length + 1,
    );
  };
  const remove = () => {
    const tabs = config.tabs.filter((t) => t.id !== active.id);
    select(tabs[Math.max(0, config.tabs.indexOf(active) - 1)]!.id);
    setValue("tabs", tabs);
    setInvalidFilters((prev) => {
      const next = new Map(prev);
      next.delete(active.id);
      return next;
    });
    track("multi_query_tab_removed", tabs.length);
  };
  const move = (unit: string) => {
    const id = nextEditorId("tab", config.tabs);
    const [original, moved] = splitMultiQueryTabByUnit(
      active,
      unit,
      readPath,
      id,
    );
    setValue(
      "tabs",
      config.tabs.flatMap((t) =>
        t.id === active.id ? [original, moved] : [t],
      ),
    );
    select(id);
    track("multi_query_series_moved_to_tab");
  };
  const changeInvalid = (tabId: string, sourceId: string, invalid: boolean) => {
    setInvalidFilters((prev) => {
      const previous = prev.get(tabId) ?? noInvalidSources;
      if (previous.has(sourceId) === invalid) return prev;
      const next = new Set(previous);
      if (invalid) next.add(sourceId);
      else next.delete(sourceId);
      return new Map(prev).set(tabId, next);
    });
  };
  const save = async () => {
    if (!canSave || !schema.success) return;
    try {
      setSubmitError("");
      await onSave(schema.data, active.id);
    } catch {
      setSubmitError("The chart could not be saved. Try again.");
    }
  };
  return (
    <div className="ph-no-capture flex h-[min(75vh,54rem)] min-h-80 min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {config.tabs.length > 1 && (
          <div className="min-w-0 flex-1">
            <Tabs value={active.id} onValueChange={select}>
              <Tabs.List
                variant="underline"
                overflow="menu"
                aria-label="Widget tabs"
              >
                {config.tabs.map((t) => (
                  <Tabs.Trigger
                    key={t.id}
                    value={t.id}
                    label={t.label || "Untitled tab"}
                  />
                ))}
              </Tabs.List>
            </Tabs>
          </div>
        )}
        <Button
          text="Add tab"
          size="sm"
          variant="ghost"
          icon={PlusIcon}
          disabled={config.tabs.length >= 9}
          onClick={() => add()}
        />
        <DropdownMenu
          noCapture
          ariaLabel="Tab actions"
          items={[
            {
              id: "duplicate",
              type: "item",
              title: "Duplicate tab",
              disabled:
                config.tabs.length >= 9 || !activeFiltersComplete
                  ? {
                      reason:
                        config.tabs.length >= 9
                          ? "This widget has nine tabs."
                          : "Finish the series filters before duplicating this tab.",
                    }
                  : undefined,
              onClick: () => add(true),
            },
            ...(config.tabs.length > 1
              ? [
                  {
                    id: "first",
                    type: "item" as const,
                    title: "Make first tab",
                    disabled:
                      config.tabs[0]!.id === active.id
                        ? { reason: "This tab already opens first." }
                        : undefined,
                    onClick: () => {
                      setValue("tabs", [
                        active,
                        ...config.tabs.filter((t) => t.id !== active.id),
                      ]);
                      track("multi_query_tab_reordered");
                    },
                  },
                  {
                    id: "remove",
                    type: "item" as const,
                    title: "Remove tab",
                    onClick: remove,
                  },
                ]
              : []),
          ]}
        >
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              label="Tab actions"
              icon={EllipsisVertical}
              size="sm"
            />
          )}
        </DropdownMenu>
      </div>
      <div className="md:hidden">
        <Tabs value={mobileArea} onValueChange={setMobileArea}>
          <Tabs.List variant="inset" size="sm" aria-label="Chart editor areas">
            <Tabs.Trigger value="series" label="Series" />
            <Tabs.Trigger value="preview" label="Preview" />
          </Tabs.List>
        </Tabs>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <div
          className={`${mobileArea === "series" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-3 overflow-y-auto md:flex`}
        >
          <label className="flex flex-col gap-1 text-xs">
            Widget title
            <Input
              aria-label="Chart title"
              value={config.title}
              maxLength={200}
              onChange={(e) => setValue("title", e.target.value)}
            />
          </label>
          <details
            className="text-xs"
            open={config.description ? true : undefined}
          >
            <summary className="text-muted-foreground cursor-pointer">
              Description
            </summary>
            <div className="pt-2">
              <Input
                aria-label="Chart description"
                value={config.description}
                maxLength={10000}
                onChange={(e) => setValue("description", e.target.value)}
              />
            </div>
          </details>
          {config.tabs
            .filter((t) => visited.has(t.id))
            .map((t) => (
              <div key={t.id} hidden={active.id !== t.id}>
                <div className="flex min-w-0 flex-col gap-2">
                  <MultiQueryTabSources
                    tab={t}
                    context={context}
                    onChange={changeTab}
                    invalidSources={
                      invalidFilters.get(t.id) ?? noInvalidSources
                    }
                    onInvalidChange={(sourceId, invalid) =>
                      changeInvalid(t.id, sourceId, invalid)
                    }
                    track={track}
                    multipleTabs={config.tabs.length > 1}
                  />
                </div>
              </div>
            ))}
        </div>
        <div
          className={`${mobileArea === "preview" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-2 [--multi-query-plot-height:clamp(16rem,38vh,30rem)] md:flex`}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold">Live preview</h3>
              <p className="text-muted-foreground text-xs">
                {formatDateRange(runtime.dateRange.from, runtime.dateRange.to)}
              </p>
              {filterState.length > 0 && (
                <details className="text-muted-foreground text-xs">
                  <summary className="cursor-pointer">
                    Dashboard filters ({filterState.length})
                  </summary>
                  <div className="flex flex-wrap gap-1">
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
                value={active.display.chartType}
                onOpenChartType={() => track("multi_query_chart_type_opened")}
                onValueChange={(chartType) => {
                  changeTab({
                    ...active,
                    display: { ...active.display, chartType },
                  });
                  track("multi_query_chart_type_changed");
                }}
              />
              <IconButton
                label={enabled ? "Pause preview" : "Resume preview"}
                icon={enabled ? PauseIcon : PlayIcon}
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
              <IconButton
                label="Refresh preview"
                icon={RefreshCw}
                size="sm"
                disabled={!enabled}
                onClick={() => {
                  runtime.refresh();
                  track("multi_query_preview_refreshed");
                }}
              />
            </div>
          </div>
          {(!activeFiltersComplete || !enabled) && (
            <VisualizationFrame
              content={{
                type: "empty",
                message: !enabled
                  ? "Preview paused"
                  : "Complete the series filters",
              }}
            />
          )}
          {activeFiltersComplete && enabled && plotUnits.length > 1 && (
            <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-bold">
                These series use different units
              </p>
              <p className="text-muted-foreground text-xs">
                {plotUnits.map(unitName).join(" · ")}. Move a unit to its own
                chart, or choose Table to see the values together.
              </p>
              {plotUnits.map((unit) => (
                <Button
                  key={unit}
                  text={"Move " + unitName(unit) + " to new tab"}
                  variant="secondary"
                  size="sm"
                  disabled={
                    config.tabs.length >= 9 ||
                    !multiQueryTabSchema.safeParse(active).success
                  }
                  onClick={() => move(unit)}
                />
              ))}
            </div>
          )}
          {activeFiltersComplete && enabled && !plotUnits.length && (
            <MultiQueryResultView
              key={active.id}
              config={runtime.config}
              runtime={runtime}
            />
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t pt-3">
        <div className="mr-auto min-w-0 text-xs">
          {error && (
            <p className="text-destructive" role="alert">
              {errorTab && config.tabs.length > 1 ? errorTab.label + " · " : ""}
              {error}
            </p>
          )}
          {reviewTab && (
            <Button
              text={"Review " + reviewTab.label}
              size="sm"
              variant="ghost"
              onClick={() => select(reviewTab.id)}
            />
          )}
        </div>
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
