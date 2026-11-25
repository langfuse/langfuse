import { type ComponentProps, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { hashKey } from "@tanstack/react-query";
import {
  DashboardDefinitionSchema,
  normalizeStudioWidget,
  type DashboardDomain,
} from "@langfuse/shared";
import { ChevronRightIcon, PlusIcon, TypeIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { DateRangeInput } from "@/src/components/design-system/DateRangeInput/DateRangeInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import Page from "@/src/components/layouts/Page";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  useReadPath,
  type ResolvedReadPath,
} from "@/src/features/events/hooks/useReadPath";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  dashboardDateRangeAggregationSettings,
  rangeToString,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import {
  DashboardQuerySchedulerProvider,
  getDashboardQuerySchedulerMaxConcurrent,
  useDashboardQueryScheduler,
} from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { cn } from "@/src/utils/tailwind";
import { useDashboardStudioEnabled } from "../useDashboardStudioEnabled";
import { useDashboardStudioCapture } from "../analytics";
import { createStudioWidget } from "../catalog";
import {
  WidgetVisionEditor,
  readWidgetEditorMode,
} from "../WidgetVisionEditor";
import { duplicateStudioWidget } from "../duplicateStudioWidget";
import { ReportCells } from "./ReportCells";
import { ReportMarkdown } from "./ReportMarkdown";
import { ReportNoteEditor } from "./ReportNoteEditor";
import {
  insertReportCell,
  reportSections,
  type ReportQuery,
  type ReportNote,
} from "./reportSections";

const waiting = (
  <div className="flex h-64 items-center justify-center">
    <Spinner size="sm" />
  </div>
);
export default function DashboardReportPage() {
  const route = useReadyRouteParams(["projectId", "dashboardId"]);
  const { readPath } = useReadPath();
  if (!route.ready || readPath === "unknown") return waiting;
  return (
    <ReportLoader
      projectId={route.params.projectId}
      dashboardId={route.params.dashboardId}
      readPath={readPath}
    />
  );
}

function ReportLoader({
  projectId,
  dashboardId,
  readPath,
}: {
  projectId: string;
  dashboardId: string;
  readPath: ResolvedReadPath;
}) {
  const capability = useDashboardStudioEnabled(projectId);
  const result = api.dashboard.getDashboard.useQuery(
    { projectId, dashboardId },
    { enabled: capability.data === true },
  );
  if (capability.isPending || (capability.data && result.isPending))
    return waiting;
  if (!capability.data || !result.data)
    return (
      <div className="space-y-4 p-6">
        <p role="status">
          {result.error?.message ??
            "Report view is unavailable for this dashboard."}
        </p>
        <Button
          text="Open dashboard"
          variant="outline"
          href={`/project/${projectId}/dashboards/${dashboardId}`}
        />
      </div>
    );
  return (
    <ReportNotebook
      key={dashboardId}
      projectId={projectId}
      dashboard={{
        ...result.data,
        definition: DashboardDefinitionSchema.parse(result.data.definition),
      }}
      readPath={readPath}
    />
  );
}

function ReportNotebook({
  projectId,
  dashboard,
  readPath,
}: {
  projectId: string;
  dashboard: DashboardDomain;
  readPath: ResolvedReadPath;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const track = useDashboardStudioCapture(readPath === "v4");
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const canEdit = hasAccess && dashboard.owner === "PROJECT";
  const { timeRange, setTimeRange } = useDashboardDateRange({
    persistAsDefault: false,
    defaultRelativeAggregation: "last90Days",
  });
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
    resetKey: rangeToString(dateRange),
  });
  const sections = reportSections(dashboard.definition);
  const sectionIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === router.query.section),
  );
  const section = sections[sectionIndex];
  const identity = { projectId, dashboardId: dashboard.id };
  const base = `/project/${projectId}/dashboards/${dashboard.id}`;
  const gridUrl = `${base}?dateRange=${encodeURIComponent(rangeToString(timeRange))}`;
  const update = api.dashboard.updateDashboardDefinition.useMutation();
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [note, setNote] = useState<ReportNote>();
  const [newNote, setNewNote] = useState(false);
  const [newChart, setNewChart] = useState<ReportQuery>();
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const stored = dashboard.definition.widgets.find(
    (p) => p.id === router.query.cell,
  );
  const selectedChart = stored?.type === "query" ? stored : newChart;
  const editing = canEdit ? selectedChart : undefined;
  const routeState = (
    changes: Record<string, string | undefined>,
    replace = false,
  ) => {
    const query: typeof router.query = {
      ...router.query,
      dateRange: rangeToString(timeRange),
      ...changes,
    };
    for (const key of Object.keys(query))
      if (query[key] === undefined) delete query[key];
    return router[replace ? "replace" : "push"](
      { pathname: router.pathname, query },
      undefined,
      { shallow: true, scroll: false },
    );
  };
  const goToSection = async (id: string) => {
    track("report_section", {
      sectionIndex: sections.findIndex((s) => s.id === id),
    });
    setFailure("");
    await routeState({
      section: id,
      card: undefined,
      cell: undefined,
      tab: undefined,
      editor: undefined,
    });
    sectionHeading.current?.scrollIntoView({ block: "start" });
  };
  const openChart = (cell: ReportQuery, tabId?: string) => {
    setFailure("");
    track("report_open_editor", {
      sectionIndex,
      editorMode:
        normalizeStudioWidget(cell.config).tabs[0]!.chart.executionMode ===
        "current"
          ? "multi-query"
          : "future",
      widgetKind: "query",
    });
    routeState({
      section: section.id,
      cell: cell.id,
      tab: tabId,
      editor: undefined,
    });
  };
  const addChart = () => {
    const config = createStudioWidget();
    config.executionMode = "current";
    config.title = "Observation count";
    config.display.chartType = "NUMBER";
    const cell: ReportQuery = {
      type: "query",
      id: crypto.randomUUID(),
      x: 0,
      y: 0,
      x_size: 12,
      y_size: 7,
      config,
    };
    setNewChart(cell);
    track("chart_added", { scope: "dashboard" });
    openChart(cell);
  };
  const closeChart = () => {
    setNewChart(undefined);
    setFailure("");
    routeState({ cell: undefined, tab: undefined, editor: undefined }, true);
  };
  const editNote = (cell: ReportNote, isNew = false) => {
    track("report_edit_note", { sectionIndex, widgetKind: "text" });
    setFailure("");
    setNewNote(isNew);
    setNote(cell);
  };
  const addNote = () =>
    editNote(
      {
        type: "text",
        id: crypto.randomUUID(),
        x: 0,
        y: 0,
        x_size: 12,
        y_size: 3,
        title: "",
        content: "",
      },
      true,
    );
  const save = async (
    draft: ReportQuery | ReportNote,
    original: ReportQuery | ReportNote | undefined,
    duplicateOf?: ReportQuery | ReportNote,
  ) => {
    if (saving.current || !canEdit) return;
    saving.current = true;
    setBusy(true);
    setFailure("");
    try {
      const latest = await utils.client.dashboard.getDashboard.query(identity);
      const definition = DashboardDefinitionSchema.parse(latest.definition);
      const source = original ?? duplicateOf;
      const target =
        source && definition.widgets.find((w) => w.id === source.id);
      if (source && (!target || hashKey([target]) !== hashKey([source])))
        throw new Error(
          "This widget changed in another editor. Reopen it to review the latest version.",
        );
      const next = original
        ? {
            ...definition,
            widgets: definition.widgets.map((item) =>
              item.id === draft.id ? draft : item,
            ),
          }
        : insertReportCell(definition, section.id, draft);
      const updated = await update.mutateAsync({
        ...identity,
        definition: next,
        expectedUpdatedAt: latest.updatedAt,
        supportedPlacementTypes: ["widget", "preset", "query", "text"],
      });
      utils.dashboard.getDashboard.setData(identity, updated);
      track(duplicateOf ? "widget_duplicated" : "widget_saved", {
        widgetKind: draft.type,
      });
      setNote(undefined);
      setNewChart(undefined);
      const savedSection = reportSections(next).find(
        (s) =>
          s.heading?.id === draft.id || s.cells.some((c) => c.id === draft.id),
      );
      await routeState(
        {
          section: savedSection?.id,
          cell: undefined,
          tab: undefined,
          editor: undefined,
        },
        true,
      );
      if (duplicateOf) {
        requestAnimationFrame(() => {
          const copy = document.getElementById("report-widget-" + draft.id);
          copy?.focus({ preventScroll: true });
          copy?.scrollIntoView({ block: "nearest" });
        });
      }
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "The widget could not be saved. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const noteEditor = note && (
    <ReportNoteEditor
      key={note.id}
      note={note}
      onSave={(draft) => save(draft, newNote ? undefined : note)}
      onCancel={() => {
        setNote(undefined);
        setFailure("");
      }}
      saving={busy}
    />
  );
  const navigationDisabled = Boolean(note) || busy;
  return (
    <Page
      scrollable={!editing}
      headerProps={{
        hideTitleRow: true,
        title: dashboard.name,
        breadcrumb: [
          { name: "Dashboards", href: `/project/${projectId}/dashboards` },
          { name: dashboard.name, href: gridUrl },
          { name: "Report" },
        ],
      }}
    >
      <DashboardQuerySchedulerProvider store={scheduler}>
        {failure && (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive sticky top-0 z-20 px-5 py-3 text-sm"
          >
            {failure}
          </p>
        )}
        {editing ? (
          <div className="flex h-full min-h-0 flex-col" aria-busy={busy}>
            {busy && (
              <p role="status" className="px-5 py-2 text-sm">
                Saving chart…
              </p>
            )}
            <ReportChartSession
              key={editing.id}
              initialTabId={
                typeof router.query.tab === "string"
                  ? router.query.tab
                  : undefined
              }
              initialMode={readWidgetEditorMode(router.query.editor)}
              cell={editing}
              isNew={!stored}
              dashboardName={dashboard.name}
              projectId={projectId}
              readPath={readPath}
              dateRange={dateRange}
              filterState={dashboard.filters}
              onCancel={closeChart}
              save={save}
            />
          </div>
        ) : (
          <div className="min-h-full">
            <header className="border-b px-5 py-5 sm:px-8">
              <div className="mx-auto flex max-w-[82rem] flex-wrap items-center justify-between gap-4">
                <div className="ph-no-capture">
                  <h1 className="text-xl font-bold tracking-tight">
                    {dashboard.name}
                  </h1>
                  {dashboard.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {dashboard.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    text="Dashboard grid"
                    size="sm"
                    variant="ghost"
                    href={gridUrl}
                  />
                  <div className="max-w-full">
                    <DateRangeInput
                      value={"range" in timeRange ? timeRange.range : "custom"}
                      customValue="custom"
                      range={dateRange}
                      presets={DASHBOARD_AGGREGATION_OPTIONS.map((value) => ({
                        value,
                        label:
                          dashboardDateRangeAggregationSettings[value].label,
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
            </header>
            <div className="mx-auto grid max-w-[82rem] items-start gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-8 lg:py-9">
              <nav aria-label="Report contents" className="lg:sticky lg:top-6">
                <p className="text-muted-foreground mb-2 text-xs font-bold">
                  Contents
                </p>
                <div className="lg:hidden">
                  <SelectInput
                    aria-label="Report section"
                    value={section.id}
                    disabled={navigationDisabled}
                    placeholder="Choose a section"
                    options={sections.map((s) => ({
                      label: s.title,
                      value: s.id,
                    }))}
                    onValueChange={(id) => goToSection(id)}
                  />
                </div>
                <div className="hidden border-l lg:flex lg:flex-col">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      aria-current={s.id === section.id ? "page" : undefined}
                      disabled={navigationDisabled}
                      className={cn(
                        "text-muted-foreground hover:text-foreground -ml-px border-l-2 border-transparent px-3 py-2 text-left text-sm",
                        s.id === section.id &&
                          "text-foreground border-primary bg-accent/50 font-medium",
                      )}
                      onClick={() => goToSection(s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </nav>
              <article aria-label={section.title} className="min-w-0 space-y-7">
                <div className="space-y-3">
                  <h2
                    ref={sectionHeading}
                    className="scroll-mt-5 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {section.title}
                  </h2>
                  {note?.id && note.id === section.heading?.id ? (
                    noteEditor
                  ) : (
                    <ReportMarkdown
                      title=""
                      content={section.introduction}
                      editLabel="Edit section"
                      onEdit={
                        canEdit && section.heading && !note
                          ? () => editNote(section.heading!)
                          : undefined
                      }
                    />
                  )}
                </div>
                <ReportCells
                  cells={section.cells}
                  context={{
                    ...identity,
                    dashboardOwner: dashboard.owner,
                    readPath,
                    dateRange,
                    filterState: dashboard.filters,
                  }}
                  selectedPreset={
                    typeof router.query.card === "string"
                      ? router.query.card
                      : undefined
                  }
                  onSelectPreset={(id) => {
                    track("view_changed", { widgetKind: "preset" });
                    routeState({ card: id }, true);
                  }}
                  onEditChart={
                    canEdit && !note && !busy ? openChart : undefined
                  }
                  onDuplicate={
                    canEdit && !note && !busy
                      ? (widget) =>
                          save(duplicateStudioWidget(widget), undefined, widget)
                      : undefined
                  }
                  onEditNote={canEdit && !note && !busy ? editNote : undefined}
                  editingNoteId={note?.id}
                  noteEditor={noteEditor}
                />
                {newNote && noteEditor}
                {canEdit && !note && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                    <Button
                      text="Add chart"
                      size="sm"
                      icon={PlusIcon}
                      variant="outline"
                      onClick={addChart}
                    />
                    <Button
                      text="Add Markdown"
                      size="sm"
                      icon={TypeIcon}
                      variant="outline"
                      onClick={addNote}
                    />
                  </div>
                )}
                {sections[sectionIndex + 1] && !note && (
                  <div className="border-t pt-5">
                    <Link
                      className="text-primary inline-flex items-center gap-1 text-sm font-medium"
                      href={{
                        pathname: router.pathname,
                        query: {
                          ...identity,
                          section: sections[sectionIndex + 1].id,
                          dateRange: rangeToString(timeRange),
                        },
                      }}
                      shallow
                      onClick={(e) => {
                        e.preventDefault();
                        goToSection(sections[sectionIndex + 1].id);
                      }}
                    >
                      Next · {sections[sectionIndex + 1].title}
                      <ChevronRightIcon size="sm" />
                    </Link>
                  </div>
                )}
              </article>
            </div>
          </div>
        )}
      </DashboardQuerySchedulerProvider>
    </Page>
  );
}

function ReportChartSession({
  cell,
  isNew,
  save,
  ...editorProps
}: Omit<
  ComponentProps<typeof WidgetVisionEditor>,
  "initialValue" | "onApply"
> & {
  cell: ReportQuery;
  save: (draft: ReportQuery, original?: ReportQuery) => Promise<void>;
}) {
  // Keep the opened version for the conflict check even if the dashboard refetches while editing.
  const [opened] = useState(() => ({ cell, isNew }));
  return (
    <WidgetVisionEditor
      {...editorProps}
      applyContext="report"
      initialValue={opened.cell.config}
      isNew={opened.isNew}
      onApply={(config) =>
        save({ ...opened.cell, config }, opened.isNew ? undefined : opened.cell)
      }
    />
  );
}
