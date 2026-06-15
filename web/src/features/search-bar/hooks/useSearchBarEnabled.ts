import { useSession } from "next-auth/react";
import { useCallback } from "react";

import { api } from "@/src/utils/api";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SEARCH_BAR_PROJECT_METADATA_KEY } from "@/src/features/search-bar/constants";

/**
 * Project-level toggle for the grammar search bar on the observations (v4
 * events) table. Stored in project metadata; flipping it requires the
 * `project:update` scope (admins/owners). Default off — the legacy filter UI
 * stays untouched until an admin opts the project in.
 */
export function useSearchBarEnabled() {
  const { project } = useQueryProject();
  const { update: updateSession } = useSession();
  const canToggle = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:update",
  });

  const mutation = api.searchBar.setEnabled.useMutation();

  const isEnabled =
    project?.metadata?.[SEARCH_BAR_PROJECT_METADATA_KEY] === true;

  const setEnabled = useCallback(
    (enabled: boolean) => {
      if (!project || !canToggle) return;
      mutation.mutate(
        { projectId: project.id, enabled },
        {
          onSuccess: async () => {
            // Project metadata is served through the session — refresh it so
            // the flag applies without a reload.
            await updateSession();
          },
        },
      );
    },
    [canToggle, mutation, project, updateSession],
  );

  return {
    isEnabled,
    canToggle,
    setEnabled,
    isLoading: mutation.isPending,
  };
}
