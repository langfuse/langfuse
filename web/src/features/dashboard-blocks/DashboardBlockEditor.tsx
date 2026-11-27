import { MultiQueryEditor } from "./multi-query/MultiQueryEditor";
import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { type WidgetDefinition } from "@langfuse/shared/dashboards";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { api } from "@/src/utils/api";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type BlockEditorRequest } from "./dashboard-block-context";
import { buildHomeWidgetRecipe } from "./homeWidgetRecipes";
import { HomePresetSelectionDialog } from "./HomePresetSelectionDialog";
import { DashboardMarkdownEditor } from "./DashboardMarkdownEditor";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";
export function DashboardBlockEditor({
  request,
  projectId,
  dashboardId,
  canEdit,
  readPath,
  dateRange,
  filterState,
  placementOptions,
  onSaved,
  onPlacementChanged,
  onPreview,
  onCancel,
}: {
  request: BlockEditorRequest;
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  placementOptions: { value: string | null; label: string }[];
  onSaved: () => void;
  onPlacementChanged: () => void;
  onPreview: () => void;
  onCancel: () => void;
}) {
  const utils = api.useUtils();
  const [recipe, setRecipe] = useState(() =>
    request.kind === "multiQuery" && request.preset
      ? buildHomeWidgetRecipe(request.preset.source.presetId, {
          ...request.preset.selection,
          version: readPath === "v4" ? "v2" : "v1",
        })
      : undefined,
  );
  const [beforePlacementId, setBeforePlacementId] = useState<string | null>(
    null,
  );
  const updatePlacement = (next: string | null) => {
    if (next === beforePlacementId) return;
    setBeforePlacementId(next);
    onPlacementChanged();
  };
  const mutation = api.dashboardWidgets.saveDefinition.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.dashboard.invalidate(),
        utils.dashboardWidgets.invalidate(),
      ]);
    },
  });
  const finishSave = (activeTabId?: string) => {
    if (activeTabId) request.onTabSaved?.(activeTabId);
    onSaved();
  };
  const error = saveErrorMessage(mutation.isError, mutation.error?.data?.code);
  const save = (content: WidgetDefinition, activeTabId?: string) => {
    if (!canEdit || mutation.isPending) return;
    mutation.mutate(
      {
        projectId,
        dashboardId,
        widgetId: request.widgetId,
        expectedRevision: request.expectedRevision,
        beforePlacementId: beforePlacementId ?? undefined,
        definition: content,
      },
      { onSuccess: () => finishSave(activeTabId) },
    );
  };
  if (!canEdit)
    return (
      <Dialog title="Editing unavailable" closeLabel="Close" noCapture>
        <Dialog.Body>
          <p className="text-muted-foreground text-sm">
            You can no longer edit this widget.
          </p>
        </Dialog.Body>
      </Dialog>
    );
  if (request.kind === "markdown")
    return (
      <DashboardMarkdownEditor
        sharedWidget={Boolean(request.widgetId)}
        initial={
          request.definition?.kind === "markdown"
            ? request.definition.config
            : { title: "", content: "" }
        }
        beforePlacementId={beforePlacementId}
        placementOptions={request.definition ? [] : placementOptions}
        pending={mutation.isPending}
        error={error}
        onPlacementChange={updatePlacement}
        onSave={(config) => save({ version: 1, kind: "markdown", config })}
        onCancel={onCancel}
        onPreview={onPreview}
      />
    );
  if (recipe && "reason" in recipe) {
    if (
      request.preset &&
      dateRange &&
      [
        "home-score-analytics",
        "home-model-usage",
        "home-generation-latency",
      ].includes(request.preset.source.presetId)
    )
      return (
        <HomePresetSelectionDialog
          preset={request.preset}
          projectId={projectId}
          dateRange={dateRange}
          filterState={filterState}
          version={readPath === "v4" ? "v2" : "v1"}
          onContinue={setRecipe}
        />
      );
    return (
      <Dialog title="Edit Home card" closeLabel="Close" noCapture>
        <Dialog.Body>
          <p className="text-muted-foreground text-sm">{recipe.reason}</p>
        </Dialog.Body>
      </Dialog>
    );
  }
  return (
    <MultiQueryEditor
      initialTabId={recipe?.initialTabId ?? request.initialTabId}
      initial={
        request.definition?.kind === "multiQuery"
          ? request.definition.config
          : recipe?.config
      }
      projectId={projectId}
      dateRange={dateRange}
      filterState={filterState}
      readPath={readPath}
      savePending={mutation.isPending}
      saveError={error}
      onSave={(config, activeTabId) => {
        if (!request.preset)
          return save({ version: 1, kind: "multiQuery", config }, activeTabId);
        if (!canEdit || mutation.isPending) return;
        mutation.mutate(
          {
            projectId,
            dashboardId,
            replacePlacementId: request.preset.template
              ? undefined
              : request.preset.source.placementId,
            replacePresetId: request.preset.template
              ? undefined
              : request.preset.source.presetId,
            definition: { version: 1, kind: "multiQuery", config },
          },
          { onSuccess: () => finishSave(activeTabId) },
        );
      }}
      onCancel={onCancel}
    >
      {!request.definition &&
        !request.preset &&
        placementOptions.length > 1 && (
          <DashboardBlockPlacement
            value={beforePlacementId}
            options={placementOptions}
            disabled={mutation.isPending}
            onChange={updatePlacement}
          />
        )}
      {request.widgetId && (
        <p className="text-muted-foreground text-sm">
          Changes apply wherever this widget is used.
        </p>
      )}
      {recipe && (
        <div className="mb-3 space-y-1 px-1 text-sm">
          <p>
            {request.preset?.template
              ? "Save creates a widget from this template."
              : "Save creates a widget and replaces this Home card in the same position."}
          </p>
          {recipe.limitations.length > 0 && (
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {recipe.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </MultiQueryEditor>
  );
}

function saveErrorMessage(failed: boolean, code: string | undefined) {
  if (!failed) return undefined;
  if (code === "CONFLICT")
    return "This widget changed in another session. Cancel and reopen the editor to see the latest version.";
  return "Could not save this widget. Your draft is still here. Try again.";
}
