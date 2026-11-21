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
  LayoutTemplateIcon,
} from "@langfuse/icons";
import Page from "@/src/components/layouts/Page";
import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
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
import { WidgetVisionEditor, readWidgetEditorMode } from "./WidgetVisionEditor";
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
          The new dashboard editor is not enabled for this deployment.
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
    return "All changes saved.";
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
        hideTitleRow: true,
        title: initialDashboard.name,
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
            <WidgetVisionEditor
              key={editor.id}
              initialMode={readWidgetEditorMode(
                router.query.edit === editor.id
                  ? router.query.editor
                  : undefined,
              )}
              initialValue={editor.config}
              isNew={!definition.widgets.some((item) => item.id === editor.id)}
              dashboardName={initialDashboard.name}
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
              dashboardName={initialDashboard.name}
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
          <div className="bg-background flex flex-col gap-4 border-b px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="ph-no-capture flex min-w-0 items-center gap-3">
                <h1 className="text-lg font-bold tracking-tight">
                  {initialDashboard.name}
                </h1>
                {isDirty ? (
                  <Badge text="Unsaved changes" color="warning" />
                ) : null}
                {message?.kind === "saved" && visibleMessage ? (
                  <span role="status" className="text-muted-foreground text-xs">
                    {visibleMessage}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <ConfirmationDialogController
                  title="Discard dashboard changes?"
                  text="Your saved dashboard will stay as it was before this editing session."
                  confirmLabel="Discard and leave"
                  variant="destructive"
                  onConfirm={async () => {
                    track("changes_discarded", { scope: "dashboard" });
                    await router.push(
                      `/project/${projectId}/dashboards/${initialDashboard.id}?dateRange=${rangeToString(timeRange)}`,
                    );
                  }}
                >
                  {({ openDialog }) => (
                    <Button
                      text={isDirty ? "Cancel" : "Done"}
                      variant="ghost"
                      onClick={async () => {
                        if (isDirty) {
                          track("view_changed", {
                            target: "discard_changes",
                            scope: "dashboard",
                          });
                          openDialog();
                        } else
                          await router.push(
                            `/project/${projectId}/dashboards/${initialDashboard.id}?dateRange=${rangeToString(timeRange)}`,
                          );
                      }}
                    />
                  )}
                </ConfirmationDialogController>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {canEdit ? (
                  <StudioPresetGallery
                    onViewChange={(view) =>
                      track("view_changed", {
                        target:
                          view === "templates"
                            ? "template_library"
                            : "legacy_library",
                        scope: "dashboard",
                      })
                    }
                    legacyPlacements={definition.widgets.filter(
                      (item) => item.type === "preset",
                    )}
                    onAdd={(presetId, configs) => {
                      if (configs.length === 1 && configs[0]) {
                        openEditor({
                          ...geometry(),
                          type: "query",
                          config: configs[0],
                        });
                      } else {
                        addConfigs(configs, null);
                      }
                      track("template_selected", {
                        presetId,
                        queryCount: configs.length,
                        widgetKind: "query",
                      });
                    }}
                    onCompare={(placement) => {
                      setMigration(placement);
                      track("migration_previewed", {
                        widgetKind: "preset",
                        presetId: placement.presetId as HomeDashboardPresetId,
                      });
                    }}
                  >
                    {({ openGallery }) => (
                      <>
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
                            <DropdownMenu
                              ariaLabel="Add a widget"
                              width="wide"
                              items={[
                                {
                                  id: "chart",
                                  type: "item",
                                  title: "Chart",
                                  description: "Query and visualize your data",
                                  icon: BarChart3Icon,
                                  onClick: () => {
                                    openEditor({
                                      ...geometry(),
                                      type: "query",
                                      config: createStudioWidget(),
                                    });
                                    track("chart_added", {
                                      widgetKind: "query",
                                    });
                                  },
                                },
                                {
                                  id: "text",
                                  type: "item",
                                  title: "Text",
                                  description: "Headings, notes and links",
                                  icon: TypeIcon,
                                  onClick: () => {
                                    openEditor({
                                      ...geometry(),
                                      type: "text",
                                      y_size: 2,
                                      title: "",
                                      content: "",
                                    });
                                    track("text_added", { widgetKind: "text" });
                                  },
                                },
                                {
                                  id: "template",
                                  type: "item",
                                  title: "From a template",
                                  description:
                                    "Costs, latency, scores and more",
                                  icon: LayoutTemplateIcon,
                                  onClick: () => openGallery("templates"),
                                },
                                {
                                  id: "metadata",
                                  type: "item",
                                  title: "Compare metadata keys",
                                  description: "Start with two filtered counts",
                                  icon: BarChart3Icon,
                                  onClick: () => {
                                    track("view_changed", {
                                      target: "metadata_comparison",
                                      scope: "dashboard",
                                    });
                                    openDialog();
                                  },
                                },
                                { id: "separator", type: "separator" },
                                {
                                  id: "paste",
                                  type: "item",
                                  title: "Paste widget",
                                  icon: ClipboardPasteIcon,
                                  onClick: () => {
                                    readTextFromClipboard().then((text) => {
                                      const placement = text
                                        ? parseStudioPlacement(text)
                                        : null;
                                      if (!placement) {
                                        setMessage({
                                          kind: "notice",
                                          text: "Copy a dashboard widget first, then paste it here.",
                                        });
                                        return;
                                      }
                                      store.getState().actions.put({
                                        ...placement,
                                        ...geometry(),
                                      });
                                      track("widget_pasted", {
                                        widgetKind: placement.type,
                                      });
                                    });
                                  },
                                },
                              ]}
                            >
                              {({ getTriggerProps }) => (
                                <Button
                                  text="Add widget"
                                  icon={PlusIcon}
                                  variant="outline"
                                  {...getTriggerProps({
                                    onClick: () =>
                                      track("add_menu_opened", {
                                        scope: "dashboard",
                                      }),
                                  })}
                                />
                              )}
                            </DropdownMenu>
                          )}
                        </StudioMetadataComparisonController>
                        <IconButton
                          label="Undo"
                          icon={Undo2Icon}
                          disabled={!canUndo}
                          onClick={() => {
                            store.getState().actions.undo();
                            track("changes_undone", {
                              scope: "dashboard",
                              widgetCount:
                                store.getState().definition.widgets.length,
                            });
                          }}
                        />
                        {definition.widgets.some(
                          (item) => item.type === "preset",
                        ) ? (
                          <Button
                            text="Legacy widgets"
                            variant="ghost"
                            onClick={() => openGallery("legacy")}
                          />
                        ) : null}
                      </>
                    )}
                  </StudioPresetGallery>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {initialDashboard.owner === "LANGFUSE"
                      ? "Clone this dashboard to edit it."
                      : "You have view access to this dashboard."}
                  </p>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
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
                <div className="w-72 max-w-full">
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
            </div>
          </div>
          {visibleMessage && message?.kind === "notice" ? (
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
                {!migration ? (
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
                      track("widget_duplicated", {
                        widgetKind: placement.type,
                      });
                    }}
                  />
                ) : null}
              </DashboardQuerySchedulerProvider>
              {!definition.widgets.length ? (
                <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
                  <BarChart3Icon size="xl" />
                  <div>
                    <h2 className="text-lg font-bold">Add your first widget</h2>
                    <p className="text-muted-foreground text-sm">
                      Create a chart, start from a template, or add text to this
                      dashboard.
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      text="Add chart"
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
