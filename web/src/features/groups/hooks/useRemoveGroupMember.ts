import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useRemoveGroupMember removes a member from a group. */
export function useRemoveGroupMember() {
  const refresh = useRefreshGroups();
  return api.groups.removeMember.useMutation({ onSuccess: refresh });
}
