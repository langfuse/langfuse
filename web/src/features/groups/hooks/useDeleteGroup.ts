import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useDeleteGroup deletes a group with its role assignments. */
export function useDeleteGroup() {
  const refresh = useRefreshGroups();
  return api.groups.delete.useMutation({ onSuccess: refresh });
}
