import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/** useCreateGroup creates a group in the organization and confirms it in a toast. */
export function useCreateGroup() {
  const utils = api.useUtils();
  return api.groups.create.useMutation({
    onSuccess: (group) => {
      utils.groups.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group.create",
        title: "Group created",
        description: `${group.displayName} created. Add members and set its role next.`,
        duration: 3000,
      });
    },
  });
}
