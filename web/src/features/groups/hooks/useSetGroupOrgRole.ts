import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { api } from "@/src/utils/api";

/** useSetGroupOrgRole sets or removes a group's organization role and confirms it in a toast. */
export function useSetGroupOrgRole(groupName: string) {
  const utils = api.useUtils();
  return api.groups.setOrgRole.useMutation({
    onSuccess: ({ role }) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group_roles.update",
        title: "Group role saved",
        description: role
          ? `${groupName} is now ${roleName(role)} in this organization`
          : `${groupName} no longer has an organization role`,
        duration: 2000,
      });
    },
  });
}
