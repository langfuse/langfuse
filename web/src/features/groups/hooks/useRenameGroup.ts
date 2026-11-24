import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useRenameGroup renames a group. */
export function useRenameGroup() {
  const refresh = useRefreshGroups();
  return api.groups.rename.useMutation({ onSuccess: refresh });
}
