import { useCanAuthorDashboardWidgets } from "@/src/features/feature-flags/hooks/useCanAuthorDashboardWidgets";
import { DashboardBlockEditor } from "./DashboardBlockEditor";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  getPendingPresetEdit,
  clearPendingPresetEdit,
} from "./homePresetNavigation";
import { type FilterState, HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { getHomePresetMetadata } from "@/src/features/dashboard/components/home-preset-registry";
import { api } from "@/src/utils/api";
import {
  DashboardBlocksContext,
  type BlockEditorRequest,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";
import { useDashboardBlockCapabilities } from "./useDashboardBlockCapabilities";

export function DashboardBlocksProvider({
  projectId,
  dashboardId,
  canEdit,
  canCloneToEdit = false,
  readPath,
  dateRange,
  filterState,
  widgets,
  dashboardReady = true,
  children,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  canCloneToEdit?: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  widgets: DashboardPlacement[];
  dashboardReady?: boolean;
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const [pendingEdit] = useState(() =>
    getPendingPresetEdit(projectId, dashboardId),
  );
  const presetInCopy = pendingEdit?.preset;
  const dismissPreset = useRef(presetInCopy?.source.presetId);
  useEffect(() => {
    if (pendingEdit) clearPendingPresetEdit(pendingEdit);
  }, [pendingEdit]);
  const authoringEnabled = useCanAuthorDashboardWidgets();
  const canAuthor =
    dashboardReady && authoringEnabled && (canEdit || canCloneToEdit);
  const capabilitiesQuery = useDashboardBlockCapabilities(projectId, canAuthor);
  const capabilities = canAuthor
    ? (capabilitiesQuery.data ?? { multiQuery: false, markdown: false })
    : { multiQuery: false, markdown: false };
  const capabilitiesPending = canAuthor && capabilitiesQuery.isPending;
  const widgetNames = api.dashboardWidgets.all.useQuery(
    { projectId, orderBy: { column: "updatedAt", order: "DESC" } },
    {
      enabled: canAuthor && widgets.some((widget) => widget.type === "widget"),
      staleTime: 60_000,
    },
  );
  const names = new Map(
    widgetNames.data?.widgets.map((widget) => [widget.id, widget.name]),
  );
  const placementOptions = [
    { value: null, label: "After all chart rows" },
    ...[...widgets]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((widget, index) => {
        const preset =
          widget.type === "preset"
            ? HOME_DASHBOARD_PRESET_IDS.find((id) => id === widget.presetId)
            : undefined;
        let name: string | undefined;
        if (preset)
          name = getHomePresetMetadata(
            preset,
            readPath === "v4" ? "v2" : "v1",
          ).name;
        else if (widget.type === "widget") name = names.get(widget.widgetId);
        return {
          value: widget.id,
          label: `Before row containing ${name ?? `chart ${index + 1}`}`,
        };
      }),
  ];
  const track: DashboardBlocksContextValue["track"] = (
    action,
    blockKind,
    isNew,
    presetId,
  ) =>
    capture("dashboard:block_interaction", {
      action,
      blockKind,
      isNew,
      ...(presetId && { presetId }),
      isV4: readPath === "v4",
    });
  return (
    <DialogController<BlockEditorRequest>
      initialState={() =>
        presetInCopy && { kind: "multiQuery", preset: presetInCopy }
      }
      onDismiss={() =>
        track(
          "cancel",
          dismissPreset.current ? "multiQuery" : undefined,
          false,
          dismissPreset.current,
        )
      }
      renderDialog={({ state: request, closeDialog }) => {
        const preset =
          request.kind === "multiQuery" ? request.preset : undefined;
        const isNew = !request.definition && !preset;
        if (preset && preset === presetInCopy) {
          if (!dashboardReady || capabilitiesPending)
            return (
              <Dialog title="Opening widget" noCapture>
                <Dialog.Body>
                  <Skeleton className="h-64 w-full" />
                </Dialog.Body>
              </Dialog>
            );
          const placement = widgets.find(
            (widget) => widget.id === preset.source.placementId,
          );
          if (
            placement?.type !== "preset" ||
            placement.presetId !== preset.source.presetId
          )
            return (
              <Dialog title="Edit Home card" closeLabel="Close" noCapture>
                <Dialog.Body>
                  This copy no longer contains the selected Home card.
                </Dialog.Body>
              </Dialog>
            );
        }
        return (
          <DashboardBlockEditor
            request={request}
            projectId={projectId}
            dashboardId={dashboardId}
            canEdit={canEdit && capabilities[request.kind]}
            {...(pendingEdit && preset === pendingEdit.preset
              ? pendingEdit.preview
              : { readPath, dateRange, filterState })}
            placementOptions={placementOptions}
            onPlacementChanged={() => track("placement", request.kind, isNew)}
            onPreview={() => track("preview", request.kind, isNew)}
            onSaved={() => {
              track(
                preset ? "preset_convert" : "save",
                request.kind,
                isNew,
                preset?.source.presetId,
              );
              closeDialog();
            }}
            onCancel={() => {
              track("cancel", request.kind, isNew, preset?.source.presetId);
              closeDialog();
            }}
          />
        );
      }}
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
            capabilitiesPending,
            capabilities,
            openEditor: (request) => {
              if (!canEdit || !capabilities[request.kind]) return;
              dismissPreset.current =
                request.kind === "multiQuery"
                  ? request.preset?.source.presetId
                  : undefined;
              if (request.kind === "multiQuery" && request.preset)
                track(
                  "preset_edit",
                  request.kind,
                  false,
                  request.preset.source.presetId,
                );
              else
                track(
                  request.definition ? "edit" : "add",
                  request.kind,
                  !request.definition,
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
