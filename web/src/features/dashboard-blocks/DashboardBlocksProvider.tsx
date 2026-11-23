import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { type FilterState, type HomeDashboardPresetId } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { getHomePresetMetadata } from "@/src/features/dashboard/components/home-preset-registry";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  DashboardBlocksContext,
  type BlockEditorRequest,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";
const DashboardBlockEditor = dynamic(
  () =>
    import("./DashboardBlockEditor").then(
      (module) => module.DashboardBlockEditor,
    ),
  {
    loading: () => (
      <Dialog title="Opening editor" noCapture>
        <Dialog.Body>
          <Skeleton className="h-64 w-full" />
        </Dialog.Body>
      </Dialog>
    ),
  },
);

export function DashboardBlocksProvider({
  projectId,
  dashboardId,
  canEdit,
  readPath,
  dateRange,
  filterState,
  widgets,
  children,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  widgets: DashboardPlacement[];
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const capabilitiesQuery = api.dashboardBlocks.capabilities.useQuery(
    { projectId },
    {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );
  const capabilities = (!capabilitiesQuery.isError &&
    capabilitiesQuery.data) || {
    multiQuery: false,
    markdown: false,
  };
  const kinds: ("multiQuery" | "markdown")[] = [];
  if (capabilities.multiQuery) kinds.push("multiQuery");
  if (capabilities.markdown) kinds.push("markdown");
  const blocks = api.dashboardBlocks.getAll.useQuery(
    { projectId, dashboardId, kinds },
    {
      enabled: capabilities.multiQuery || capabilities.markdown,
      staleTime: 0,
      refetchOnMount: true,
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );
  const widgetNames = api.dashboardWidgets.all.useQuery(
    { projectId, orderBy: { column: "updatedAt", order: "DESC" } },
    {
      enabled:
        canEdit &&
        widgets.some((widget) => widget.type === "widget") &&
        (capabilities.multiQuery || capabilities.markdown),
      staleTime: 60_000,
    },
  );
  const placementOptions: DashboardBlocksContextValue["placementOptions"] = [
    { value: null, label: "After all chart rows" },
    ...[...widgets]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((widget, index) => ({
        value: widget.id,
        label: `Before row containing ${widget.type === "preset" ? getHomePresetMetadata(widget.presetId as HomeDashboardPresetId, readPath === "v4" ? "v2" : "v1").name : (widgetNames.data?.widgets.find((item) => item.id === widget.widgetId)?.name ?? `chart ${index + 1}`)}`,
      })),
  ];
  const track: DashboardBlocksContextValue["track"] = (
    action,
    blockKind,
    isNew,
  ) =>
    capture("dashboard:block_interaction", {
      action,
      blockKind,
      isNew,
      isV4: readPath === "v4",
    });
  const visibleBlocks = (blocks.data ?? []).filter(
    (block) => capabilities[block.kind],
  );
  return (
    <DialogController<BlockEditorRequest>
      onDismiss={() => track("cancel")}
      renderDialog={({ state, closeDialog }) => (
        <DashboardBlockEditor
          request={state}
          projectId={projectId}
          dashboardId={dashboardId}
          canEdit={canEdit && capabilities[state.kind]}
          readPath={readPath}
          dateRange={dateRange}
          filterState={filterState}
          placementOptions={placementOptions}
          onPlacementChanged={() =>
            track("placement", state.kind, !state.block)
          }
          onPreview={() => track("preview", state.kind, !state.block)}
          onSaved={() => {
            track("save", state.kind, !state.block);
            closeDialog();
          }}
          onCancel={() => {
            track("cancel", state.kind, !state.block);
            closeDialog();
          }}
        />
      )}
    >
      {({ openDialog }) => (
        <DashboardBlocksContext.Provider
          value={{
            projectId,
            dashboardId,
            canEdit,
            readPath,
            dateRange,
            filterState,
            capabilitiesPending: capabilitiesQuery.isPending,
            capabilities,
            blocks: visibleBlocks,
            widgets,
            placementOptions,
            loadError: blocks.isError || capabilitiesQuery.isError,
            openEditor: (request) => {
              if (!canEdit || !capabilities[request.kind]) return;
              track(
                request.block ? "edit" : "add",
                request.kind,
                !request.block,
              );
              openDialog(request);
            },
            track,
          }}
        >
          {children}
        </DashboardBlocksContext.Provider>
      )}
    </DialogController>
  );
}
