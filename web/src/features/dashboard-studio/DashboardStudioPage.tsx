import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";
import { hashKey } from "@tanstack/react-query";
import {
  DashboardDefinitionSchema,
  type DashboardDefinition,
  type DashboardDomain,
  type StudioWidgetConfig,
  type HomeDashboardPresetId,
  type FilterState,
} from "@langfuse/shared";
import {
  PlusIcon,
  TypeIcon,
  Undo2Icon,
  ClipboardPasteIcon,
  BarChart3Icon,
} from "@langfuse/icons";
import Page from "@/src/components/layouts/Page";
import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DateRangeInput } from "@/src/components/design-system/DateRangeInput/DateRangeInput";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { api } from "@/src/utils/api";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import {
  useReadPath,
  type ResolvedReadPath,
} from "@/src/features/events/hooks/useReadPath";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import { findFreeGridPosition } from "@/src/features/widgets/utils/grid-placement";
import {
  DashboardQuerySchedulerProvider,
  useDashboardQueryScheduler,
  getDashboardQuerySchedulerMaxConcurrent,
} from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  dashboardDateRangeAggregationSettings,
  toAbsoluteTimeRange,
  rangeToString,
} from "@/src/utils/date-range-utils";
import { readTextFromClipboard } from "@/src/utils/clipboard";
import { createStudioStore } from "./studioStore";
import { createMetadataComparison, createStudioWidget } from "./catalog";
import { StudioWidgetEditor } from "./StudioWidgetEditor";
import { StudioTextEditor } from "./StudioTextEditor";
import { type StudioPlacement } from "./StudioPlacementCard";
import { parseStudioPlacement } from "./clipboard";
import { useDashboardStudioCapture } from "./analytics";
import { StudioPresetGallery } from "./StudioPresetGallery";
import { StudioMigrationPanel } from "./StudioMigrationPanel";
import { StudioDashboardFilters } from "./StudioDashboardFilters";
import { saveStudioDashboard } from "./saveStudioDashboard";
import { StudioMetadataComparisonController } from "./StudioMetadataComparisonController";
import { useDashboardStudioEnabled } from "./useDashboardStudioEnabled";

export default function DashboardStudioPage() {
  const route = useReadyRouteParams(["projectId", "dashboardId"]);
  const { readPath } = useReadPath();
  if (!route.ready || readPath === "unknown")
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  return (
    <DashboardStudioLoader
      projectId={route.params.projectId}
      dashboardId={route.params.dashboardId}
      readPath={readPath}
    />
  );
}

function DashboardStudioLoader({
  projectId,
  dashboardId,
  readPath,
}: {
  projectId: string;
  dashboardId: string;
  readPath: ResolvedReadPath;
}) {
  const enabled = useDashboardStudioEnabled(projectId);
  const dashboard = api.dashboard.getDashboard.useQuery(
    {
      projectId,
      dashboardId,
    },
    { enabled: enabled.data === true },
  );
  if (enabled.isPending || (enabled.data && dashboard.isPending))
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  if (!enabled.data)
    return (
      <div className="flex flex-col items-start gap-3 p-6 text-sm">
        <p role="status">
          Dashboard studio is not enabled for this deployment.
        </p>
        <Button
          text="View dashboard"
          variant="outline"
          href={`/project/${projectId}/dashboards/${dashboardId}`}
        />
      </div>
    );
  if (!dashboard.data)
    return (
      <div role="alert" className="p-6 text-sm">
        {dashboard.error?.message ?? "Dashboard not found"}
      </div>
    );
  return (
    <StudioWorkspace
      key={dashboard.data.id}
      initialDashboard={{
        ...dashboard.data,
        definition: DashboardDefinitionSchema.parse(dashboard.data.definition),
      }}
      projectId={projectId}
      readPath={readPath}
    />
  );
}

function StudioWorkspace({
  initialDashboard,
  projectId,
  readPath,
}: {
  initialDashboard: DashboardDomain;
  projectId: string;
  readPath: ResolvedReadPath;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const track = useDashboardStudioCapture(readPath === "v4");
  const didTrackOpen = useRef(false);
  // Analytics is an external system; one loaded workspace produces one entry event.
  useEffect(() => {
    if (didTrackOpen.current) return;
    didTrackOpen.current = true;
    track("opened", {
      widgetCount: initialDashboard.definition.widgets.length,
    });
  }, [initialDashboard.definition.widgets.length, track]);
  const [store] = useState(() =>
    createStudioStore(initialDashboard.definition),
  );
  const definition = useStore(store, (state) => state.definition);
  const documentDirty = useStore(
    store,
    (state) =>
      JSON.stringify(state.definition) !==
      JSON.stringify(state.savedDefinition),
  );
  const canUndo = useStore(store, (state) => state.history.length > 0);
  const [filters, setFilters] = useState<FilterState>(initialDashboard.filters);
  const [savedFilters, setSavedFilters] = useState<FilterState>(
    initialDashboard.filters,
  );
  const isDirty =
    documentDirty || JSON.stringify(filters) !== JSON.stringify(savedFilters);
  const [editor, setEditor] = useState<StudioPlacement | null>(() => {
    const initial = initialDashboard.definition.widgets.find(
      (item) => item.id === router.query.edit,
    );
    return initial?.type === "query" || initial?.type === "text"
      ? initial
      : null;
  });
  const [message, setMessage] = useState<
    | { kind: "saved"; snapshot: string }
    | { kind: "notice"; text: string }
    | null
  >(null);
  const visibleMessage = (() => {
    if (!message) return null;
    if (message.kind === "notice") return message.text;
    if (isDirty || message.snapshot !== hashKey([definition, filters]))
      return null;
    return "Dashboard saved. Your widgets and shared filters are ready on the regular dashboard, too.";
  })();
  const [migration, setMigration] = useState<Extract<
    DashboardDefinition["widgets"][number],
    { type: "preset" }
  > | null>(null);
  const { timeRange, setTimeRange } = useDashboardDateRange({
    persistAsDefault: false,
    defaultRelativeAggregation: "last90Days",
  });
  // Freeze relative bounds for a query run so local editor renders share one cache key.
  const dateRange = useMemo(
    () =>
      toAbsoluteTimeRange(timeRange) ?? {
        from: new Date(Date.now() - 90 * 86400000),
        to: new Date(),
      },
    [timeRange],
  );
  const scheduler = useDashboardQueryScheduler({
    maxConcurrent: getDashboardQuerySchedulerMaxConcurrent(timeRange),
    resetKey: `${dateRange.from.toISOString()}_${dateRange.to.toISOString()}`,
  });
  const update = api.dashboard.updateDashboardDefinition.useMutation();
  const updateFilters = api.dashboard.updateDashboardFilters.useMutation();
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const canEdit = hasWriteAccess && initialDashboard.owner === "PROJECT";
  const geometry = () => ({
    id: crypto.randomUUID(),
    ...findFreeGridPosition(store.getState().definition.widgets, {
      x_size: 6,
      y_size: 5,
    }),
    x_size: 6,
    y_size: 5,
  });
  const openEditor = (placement: StudioPlacement) => {
    setEditor(placement);
    setMessage(null);
    track("editor_opened", { widgetKind: placement.type });
  };
  const cancelEditor = () => {
    track("editor_cancelled", { widgetKind: editor?.type });
    setEditor(null);
  };
  const saveDashboard = () => {
    saveStudioDashboard({
      store,
      filters,
      saveDefinition: (definition) =>
        update.mutateAsync({
          projectId,
          dashboardId: initialDashboard.id,
          definition,
          supportedPlacementTypes: ["widget", "preset", "query", "text"],
        }),
      saveFilters: (nextFilters) =>
        updateFilters.mutateAsync({
          projectId,
          dashboardId: initialDashboard.id,
          filters: nextFilters,
        }),
    }).then(
      ({ definition: savedDefinition, filters: nextFilters }) => {
        setSavedFilters(nextFilters);
        setMessage({
          kind: "saved",
          snapshot: hashKey([savedDefinition, nextFilters]),
        });
        utils.dashboard.getDashboard.invalidate({
          projectId,
          dashboardId: initialDashboard.id,
        });
        track("changes_saved", {
          widgetCount: savedDefinition.widgets.length,
          filterCount: nextFilters.length,
        });
      },
      (error: unknown) => {
        setMessage({
          kind: "notice",
          text:
            error instanceof Error
              ? `The dashboard could not finish saving: ${error.message}. Retry to save all changes.`
              : "The dashboard could not finish saving. Retry to save all changes.",
        });
        track("save_failed", { reason: "network", scope: "dashboard" });
      },
    );
  };
  const addConfigs = (
    configs: StudioWidgetConfig[],
    anchor: typeof migration,
  ) => {
    const current = store.getState().definition;
    const existing = current.widgets.filter((item) => item.id !== anchor?.id);
    const additions: Extract<StudioPlacement, { type: "query" }>[] = [];
    const size = { x_size: anchor?.x_size ?? 6, y_size: anchor?.y_size ?? 5 };
    for (const [index, config] of configs.entries()) {
      const position =
        index === 0 && anchor
          ? { x: anchor.x, y: anchor.y }
          : findFreeGridPosition([...existing, ...additions], size);
      additions.push({
        type: "query",
        id: index === 0 && anchor ? anchor.id : crypto.randomUUID(),
        ...position,
        ...size,
        config,
      });
    }
    store.getState().actions.replace({
      ...current,
      widgets: [...existing, ...additions],
    });
    setMigration(null);
  };
  return (
    <Page
      scrollable={!editor}
      headerProps={{
        hideTitleRow: Boolean(editor),
        title: "Dashboard studio",
        breadcrumb: [
          { name: "Dashboards", href: `/project/${projectId}/dashboards` },
          {
            name: initialDashboard.name,
            href: `/project/${projectId}/dashboards/${initialDashboard.id}`,
          },
        ],
      }}
    >
      {editor ? (
        <DashboardQuerySchedulerProvider store={scheduler}>
          {editor?.type === "query" ? (
            <StudioWidgetEditor
              key={editor.id}
              initialValue={editor.config}
              isNew={!definition.widgets.some((item) => item.id === editor.id)}
              projectId={projectId}
              readPath={readPath}
              dateRange={dateRange}
              filterState={filters}
              onApply={(config) => {
                store.getState().actions.put({ ...editor, config });
                setEditor(null);
              }}
              onCancel={cancelEditor}
            />
          ) : null}
          {editor?.type === "text" ? (
            <StudioTextEditor
              key={editor.id}
              initialValue={editor}
              isNew={!definition.widgets.some((item) => item.id === editor.id)}
              onApply={(value) => {
                store.getState().actions.put({ ...editor, ...value });
                setEditor(null);
                track("widget_saved", { widgetKind: "text" });
              }}
              onCancel={cancelEditor}
            />
          ) : null}
        </DashboardQuerySchedulerProvider>
      ) : (
        <>
          <div className="bg-background border-b px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="ph-no-capture flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight">
                    {initialDashboard.name}
                  </h1>
                  <Badge text="Studio" color="violet" />
                  {isDirty ? (
                    <Badge text="Unsaved changes" color="warning" />
                  ) : null}
                </div>
                <p className="text-muted-foreground max-w-2xl text-sm">
                  Build widgets here, compare any populations, and give the
                  numbers a story.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  text="View dashboard"
                  href={`/project/${projectId}/dashboards/${initialDashboard.id}?dateRange=${rangeToString(timeRange)}`}
                  variant="outline"
                />
                {canEdit ? (
                  <Button
                    text="Save dashboard"
                    loading={update.isPending || updateFilters.isPending}
                    disabled={!isDirty}
                    onClick={saveDashboard}
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button
                    text="Add chart"
                    icon={PlusIcon}
                    variant="outline"
                    onClick={() => {
                      openEditor({
                        ...geometry(),
                        type: "query",
                        config: createStudioWidget(),
                      });
                      track("chart_added", { widgetKind: "query" });
                    }}
                  />
                  <Button
                    text="Add text"
                    icon={TypeIcon}
                    variant="outline"
                    onClick={() => {
                      openEditor({
                        ...geometry(),
                        type: "text",
                        y_size: 2,
                        title: "",
                        content:
                          "## Start with the question\n\nAdd context, explain a result, or introduce the next section.",
                      });
                      track("text_added", { widgetKind: "text" });
                    }}
                  />
                  <StudioMetadataComparisonController
                    onCreate={(keys) => {
                      openEditor({
                        ...geometry(),
                        type: "query",
                        config: createMetadataComparison(keys),
                      });
                      track("template_selected", {
                        widgetKind: "query",
                        queryCount: 2,
                      });
                    }}
                  >
                    {({ openDialog }) => (
                      <Button
                        text="Compare metadata"
                        icon={BarChart3Icon}
                        variant="ghost"
                        onClick={() => openDialog()}
                      />
                    )}
                  </StudioMetadataComparisonController>
                  <Button
                    text="Paste"
                    icon={ClipboardPasteIcon}
                    variant="ghost"
                    onClick={() => {
                      readTextFromClipboard().then((text) => {
                        const placement = text
                          ? parseStudioPlacement(text)
                          : null;
                        if (!placement) {
                          setMessage({
                            kind: "notice",
                            text: "Copy a studio widget first, then paste it here.",
                          });
                          return;
                        }
                        store
                          .getState()
                          .actions.put({ ...placement, ...geometry() });
                        track("widget_pasted", { widgetKind: placement.type });
                      });
                    }}
                  />
                  <Button
                    text="Undo"
                    icon={Undo2Icon}
                    variant="ghost"
                    disabled={!canUndo}
                    onClick={() => store.getState().actions.undo()}
                  />
                  {isDirty ? (
                    <Button
                      text="Discard"
                      variant="ghost"
                      onClick={() => {
                        store.getState().actions.discard();
                        setFilters(savedFilters);
                        setEditor(null);
                        track("changes_discarded", { scope: "dashboard" });
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {initialDashboard.owner === "LANGFUSE"
                    ? "Clone this dashboard to make it your own."
                    : "You have view access to this dashboard."}
                </p>
              )}
            </div>
            <div className="w-80 max-w-full">
              <DateRangeInput
                value={"range" in timeRange ? timeRange.range : "custom"}
                customValue="custom"
                range={dateRange}
                presets={DASHBOARD_AGGREGATION_OPTIONS.map((value) => ({
                  value,
                  label: dashboardDateRangeAggregationSettings[value].label,
                }))}
                onPresetChange={(range) => {
                  setTimeRange({ range });
                  track("date_range_changed", { scope: "dashboard" });
                }}
                onCustomChange={(range) => {
                  setTimeRange(range);
                  track("date_range_changed", { scope: "dashboard" });
                }}
              />
            </div>
          </div>
          <div className="border-b px-5 py-3">
            <StudioDashboardFilters
              projectId={projectId}
              isV4={readPath === "v4"}
              timeRange={timeRange}
              filters={filters}
              onChange={(nextFilters) => {
                setFilters(nextFilters);
                track("filter_applied", {
                  scope: "dashboard",
                  filterCount: nextFilters.length,
                });
              }}
            />
          </div>
          {visibleMessage ? (
            <div
              role="status"
              className="ph-no-capture bg-muted px-5 py-3 text-sm"
            >
              {visibleMessage}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <div className="bg-muted/20 min-w-0 p-4">
              <DashboardQuerySchedulerProvider store={scheduler}>
                {canEdit ? (
                  <div className="pb-4">
                    <StudioPresetGallery
                      legacyPlacements={definition.widgets.filter(
                        (item) => item.type === "preset",
                      )}
                      onAdd={(presetId, configs) => {
                        addConfigs(configs, null);
                        track("template_selected", {
                          presetId,
                          queryCount: configs.length,
                          widgetKind: "query",
                        });
                      }}
                      onCompare={(placement) => {
                        setMigration(placement);
                        setEditor(null);
                        track("migration_previewed", {
                          widgetKind: "preset",
                          presetId: placement.presetId as HomeDashboardPresetId,
                        });
                      }}
                    />
                  </div>
                ) : null}
                {migration ? (
                  <div className="pb-4">
                    <StudioMigrationPanel
                      projectId={projectId}
                      dashboardId={initialDashboard.id}
                      placement={migration}
                      readPath={readPath}
                      dateRange={dateRange}
                      filterState={filters}
                      onReplace={(configs) => {
                        addConfigs(configs, migration);
                        track("migration_applied", {
                          widgetKind: "preset",
                          presetId: migration.presetId as HomeDashboardPresetId,
                        });
                      }}
                      onKeepBoth={(configs) => addConfigs(configs, null)}
                      onCancel={() => setMigration(null)}
                    />
                  </div>
                ) : null}
                <DashboardGrid
                  widgets={definition.widgets}
                  onChange={(widgets) =>
                    store.getState().actions.replace({
                      ...store.getState().definition,
                      widgets,
                    })
                  }
                  canEdit={canEdit}
                  dashboardId={initialDashboard.id}
                  projectId={projectId}
                  readPath={readPath}
                  dateRange={dateRange}
                  filterState={filters}
                  onDeleteWidget={(id) => {
                    const placement = store
                      .getState()
                      .definition.widgets.find((item) => item.id === id);
                    store.getState().actions.remove(id);
                    track("widget_deleted", { widgetKind: placement?.type });
                  }}
                  dashboardOwner={initialDashboard.owner}
                  onEditStudioPlacement={openEditor}
                  onDuplicateStudioPlacement={(placement) => {
                    store.getState().actions.duplicate(placement);
                    track("widget_duplicated", { widgetKind: placement.type });
                  }}
                  onDuplicatePreset={(placement) =>
                    store.getState().actions.duplicate(placement)
                  }
                />
              </DashboardQuerySchedulerProvider>
              {!definition.widgets.length ? (
                <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
                  <BarChart3Icon size="xl" />
                  <div>
                    <h2 className="text-lg font-bold">
                      A dashboard starts with a question
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Compare metadata coverage, monitor costs, or follow
                      quality over time.
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      text="Build your first widget"
                      icon={PlusIcon}
                      onClick={() =>
                        openEditor({
                          ...geometry(),
                          type: "query",
                          config: createStudioWidget(),
                        })
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
