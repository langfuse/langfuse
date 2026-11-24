import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useAddGroupMembers adds organization members to a group and confirms it in a toast. */
export function useAddGroupMembers(groupName: string) {
  const refresh = useRefreshGroups();
  return api.groups.addMembers.useMutation({
    onSuccess: () => {
      refresh();
      showSuccessToast({
        operation: "group_members.update",
        title: "Members added",
        description: `Updated members of ${groupName}`,
        duration: 2000,
      });
    },
  });
}
