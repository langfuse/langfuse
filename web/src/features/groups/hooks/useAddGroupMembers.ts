import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/** useAddGroupMembers adds organization members to a group and confirms it in a toast. */
export function useAddGroupMembers(groupName: string) {
  const utils = api.useUtils();
  return api.groups.addMembers.useMutation({
    onSuccess: () => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group_members.update",
        title: "Members added",
        description: `Updated members of ${groupName}`,
        duration: 2000,
      });
    },
  });
}
