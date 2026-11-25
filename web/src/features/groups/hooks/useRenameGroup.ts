import { api } from "@/src/utils/api";

/** useRenameGroup renames a group. */
export function useRenameGroup() {
  const utils = api.useUtils();
  return api.groups.rename.useMutation({
    onSuccess: () => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
    },
  });
}
