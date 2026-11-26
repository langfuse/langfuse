import { api } from "@/src/utils/api";

/** useDeleteGroup deletes a group with its role assignments. */
export function useDeleteGroup() {
  const utils = api.useUtils();
  return api.groups.delete.useMutation({
    onSuccess: () => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
    },
  });
}
