import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useSetGroupOrgRole sets or removes a group's organization role and confirms it in a toast. */
export function useSetGroupOrgRole(groupName: string) {
  const refresh = useRefreshGroups();
  return api.groups.setOrgRole.useMutation({
    onSuccess: ({ role }) => {
      refresh();
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
