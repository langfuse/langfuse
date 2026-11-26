import { useState } from "react";
import { type FilterState, type HomeDashboardPresetId } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type PresetSelection } from "@/src/features/dashboard/components/home-preset-registry";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { buildHomeWidgetRecipe } from "./homeWidgetRecipes";
import { HomePresetSelectionDialog } from "./HomePresetSelectionDialog";

type CopyRequest = {
  presetId: HomeDashboardPresetId;
  selection: PresetSelection;
  place: (widgetId: string) => boolean;
};

export function useCopyHomeWidget({
  projectId,
  version,
  dateRange,
  filterState,
}: {
  projectId: string;
  version: ViewVersion;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
}) {
  const utils = api.useUtils();
  const create = api.dashboardWidgets.saveDefinition.useMutation();
  const remove = api.dashboardWidgets.delete.useMutation();
  const [pending, setPending] = useState<CopyRequest>();
  const save = async (
    request: CopyRequest,
    recipe: ReturnType<typeof buildHomeWidgetRecipe>,
  ) => {
    if (!("config" in recipe)) return;
    try {
      const { widget } = await create.mutateAsync({
        projectId,
        definition: {
          version: 1,
          kind: "multiQuery",
          config: {
            ...recipe.config,
            tabs: recipe.initialTabId
              ? [
                  ...recipe.config.tabs.filter(
                    (tab) => tab.id === recipe.initialTabId,
                  ),
                  ...recipe.config.tabs.filter(
                    (tab) => tab.id !== recipe.initialTabId,
                  ),
                ]
              : recipe.config.tabs,
          },
        },
      });
      if (!request.place(widget.id))
        await remove.mutateAsync({ projectId, widgetId: widget.id });
      await utils.dashboardWidgets.invalidate();
    } catch (error) {
      showErrorToast(
        "Failed to copy Home card",
        error instanceof Error ? error.message : "Unknown error",
        classifyTrpcToastError(error, "widget.clone"),
      );
    }
  };
  const copy = (request: CopyRequest) => {
    const recipe = buildHomeWidgetRecipe(request.presetId, {
      ...request.selection,
      version,
    });
    if ("config" in recipe) {
      save(request, recipe);
    } else if (dateRange) {
      setPending(request);
    }
  };
  const selectionDialog = pending && dateRange && (
    <DialogController
      key={pending.presetId}
      initialState={() => true}
      onDismiss={() => setPending(undefined)}
      renderDialog={({ closeDialog }) => (
        <HomePresetSelectionDialog
          preset={{
            source: { placementId: "copy", presetId: pending.presetId },
            selection: pending.selection,
            template: true,
          }}
          projectId={projectId}
          version={version}
          dateRange={dateRange}
          filterState={filterState}
          actionLabel="Add widget"
          onContinue={(recipe) => {
            closeDialog();
            setPending(undefined);
            save(pending, recipe);
          }}
        />
      )}
    >
      {() => null}
    </DialogController>
  );
  return { copy, selectionDialog };
}
