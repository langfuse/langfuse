import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/** useRemoveGroupMember removes a member from a group and confirms it in a toast. */
export function useRemoveGroupMember(groupName: string) {
  const utils = api.useUtils();
  return api.groups.removeMember.useMutation({
    onSuccess: () => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group_members.update",
        title: "Member removed",
        description: `Updated members of ${groupName}`,
        duration: 2000,
      });
    },
  });
}
