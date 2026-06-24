import { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { type ScoreConfigSelection } from "@/src/features/scores/types";
import { api } from "@/src/utils/api";
import { type ScoreConfigDomain } from "@langfuse/shared";

/**
 * Prepares score configs for the AnnotationForm based on selection mode.
 *
 * Two modes:
 * - **Fixed**: Uses preselected configs (no fetching required)
 * - **Selectable**: Fetches all available configs and tracks user selections
 *
 * @param projectId - Project to fetch configs for (only used in selectable mode)
 * @param configSelection - Either fixed configs or selectable mode
 * @returns isLoading - True while fetching configs (always false in fixed mode)
 * @returns availableConfigs - All score configs to display
 * @returns selectedConfigIds - IDs of configs that are preselected
 */
export function useAnnotationScoreConfigs({
  projectId,
  configSelection,
  emptySelectedConfigIdsStorageKey,
}: {
  projectId: string;
  configSelection: ScoreConfigSelection;
  emptySelectedConfigIdsStorageKey?: string;
}): {
  isLoading: boolean;
  availableConfigs: ScoreConfigDomain[];
  selectedConfigIds: string[];
} {
  const { emptySelectedConfigIds } = useEmptyScoreConfigs(
    emptySelectedConfigIdsStorageKey,
  );

  const configs = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: configSelection.mode === "selectable",
    },
  );

  if (configSelection.mode === "fixed") {
    return {
      isLoading: false,
      selectedConfigIds: configSelection.configs.map((c) => c.id),
      availableConfigs: configSelection.configs,
    };
  }
  return {
    isLoading: configs.isLoading,
    selectedConfigIds: emptySelectedConfigIds,
    availableConfigs: configs.data?.configs ?? [],
  };
}
