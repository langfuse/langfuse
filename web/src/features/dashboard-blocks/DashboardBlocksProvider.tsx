import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  getPendingPresetEdit,
  clearPendingPresetEdit,
} from "./homePresetNavigation";
import { type FilterState, type SavedDashboardBlock } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  DashboardBlocksContext,
  type BlockEditorRequest,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";
import { useDashboardBlocksData } from "./useDashboardBlocksData";

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

const DashboardBlockPositionEditor = dynamic(
  () =>
    import("./DashboardBlockPositionEditor").then(
      (module) => module.DashboardBlockPositionEditor,
    ),
  {
    loading: () => (
      <Dialog title="Edit position" noCapture>
        <Dialog.Body>
          <Skeleton className="h-24 w-full" />
        </Dialog.Body>
      </Dialog>
    ),
  },
);

type DashboardBlockDialogRequest =
  | { intent: "content"; request: BlockEditorRequest }
  | { intent: "position"; block: SavedDashboardBlock };

export function DashboardBlocksProvider({
  projectId,
  dashboardId,
  canEdit,
  canCloneToEdit = false,
  readPath,
  dateRange,
  filterState,
  widgets,
  hasDashboardBlocks,
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
  hasDashboardBlocks?: boolean;
  dashboardReady?: boolean;
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const [presetInCopy] = useState(() =>
    getPendingPresetEdit(projectId, dashboardId),
  );
  const dismissPreset = useRef(presetInCopy?.source.presetId);
  const [savedPresetTabs, setSavedPresetTabs] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  useEffect(() => {
    if (presetInCopy) clearPendingPresetEdit(presetInCopy);
  }, [presetInCopy]);
  const authoringEnabled = useIsFeatureEnabled("dashboardBlockAuthoring");
  const {
    capabilities,
    capabilitiesPending,
    blocksPending,
    blocks,
    placementOptions,
    loadError,
  } = useDashboardBlocksData({
    projectId,
    dashboardId,
    canEdit: canEdit || canCloneToEdit,
    readPath,
    widgets,
    hasDashboardBlocks,
    dashboardReady,
    authoringEnabled,
  });
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
    <DialogController<DashboardBlockDialogRequest>
      initialState={() =>
        presetInCopy && {
          intent: "content",
          request: { kind: "multiQuery", preset: presetInCopy },
        }
      }
      onDismiss={() => {
        if (dismissPreset.current)
          track("cancel", "multiQuery", false, dismissPreset.current);
        else track("cancel");
      }}
      renderDialog={({ state, closeDialog }) => {
        const kind =
          state.intent === "position" ? state.block.kind : state.request.kind;
        const preset =
          state.intent === "content" && state.request.kind === "multiQuery"
            ? state.request.preset
            : undefined;
        const isNew =
          state.intent === "content" && !state.request.block && !preset;
        const existingInCopy =
          preset && preset === presetInCopy
            ? blocks.find(
                (block) =>
                  block.kind === "multiQuery" &&
                  block.sourcePreset?.placementId === preset.source.placementId,
              )
            : undefined;
        const allowed = canEdit && capabilities[kind];
        const onSaved = () => {
          track(
            preset && !existingInCopy ? "preset_convert" : "save",
            kind,
            isNew,
            preset?.source.presetId,
          );
          closeDialog();
        };
        const onCancel = () => {
          track("cancel", kind, isNew, preset?.source.presetId);
          closeDialog();
        };
        const onPlacementChanged = () => track("placement", kind, isNew);
        if (state.intent === "position")
          return (
            <DashboardBlockPositionEditor
              block={state.block}
              projectId={projectId}
              dashboardId={dashboardId}
              canEdit={allowed}
              options={placementOptions}
              onSaved={onSaved}
              onCancel={onCancel}
              onPositionChanged={onPlacementChanged}
            />
          );
        let request = state.request;
        if (preset && preset === presetInCopy) {
          if (!dashboardReady || capabilitiesPending || blocksPending)
            return (
              <Dialog title="Opening widget" noCapture>
                <Dialog.Body>
                  <Skeleton className="h-64 w-full" />
                </Dialog.Body>
              </Dialog>
            );
          const placement = widgets.find(
            (w) => w.id === preset.source.placementId,
          );
          if (
            loadError ||
            placement?.type !== "preset" ||
            placement.presetId !== preset.source.presetId
          )
            return (
              <Dialog title="Edit Home card" closeLabel="Close" noCapture>
                <Dialog.Body>
                  {loadError
                    ? "The dashboard could not be loaded. Refresh and try again."
                    : "This copy no longer contains the selected Home card."}
                </Dialog.Body>
              </Dialog>
            );
          if (existingInCopy)
            request = { kind: "multiQuery", block: existingInCopy };
        }
        if (preset)
          request = {
            ...request,
            onTabSaved: (tabId) => {
              setSavedPresetTabs((previous) =>
                new Map(previous).set(preset.source.placementId, tabId),
              );
            },
          };
        return (
          <DashboardBlockEditor
            request={request}
            projectId={projectId}
            dashboardId={dashboardId}
            canEdit={allowed}
            readPath={readPath}
            dateRange={dateRange}
            filterState={filterState}
            placementOptions={placementOptions}
            onPlacementChanged={onPlacementChanged}
            onPreview={() => track("preview", kind, isNew)}
            onSaved={onSaved}
            onCancel={onCancel}
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
            blocksPending,
            capabilities,
            blocks,
            savedPresetTabs,
            widgets,
            placementOptions,
            loadError,
            openPositionEditor: (block) => {
              if (!canEdit || !capabilities[block.kind]) return;
              dismissPreset.current = undefined;
              track("placement", block.kind, false);
              openDialog({ intent: "position", block });
            },
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
                  request.block ? "edit" : "add",
                  request.kind,
                  !request.block,
                );
              openDialog({ intent: "content", request });
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
