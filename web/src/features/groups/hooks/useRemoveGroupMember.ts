import { api } from "@/src/utils/api";

/** useRemoveGroupMember removes a member from a group. */
export function useRemoveGroupMember() {
  const utils = api.useUtils();
  return api.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
}
