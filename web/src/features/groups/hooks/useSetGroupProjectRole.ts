import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

/** useSetGroupProjectRole sets or removes a group's role on a project and confirms it in a toast. */
export function useSetGroupProjectRole(groupName: (groupId: string) => string) {
  const refresh = useRefreshGroups();
  return api.groups.setProjectRole.useMutation({
    onSuccess: (_, input) => {
      refresh();
      const name = groupName(input.groupId);
      showSuccessToast({
        operation: "group_project_role.update",
        title: "Group role saved",
        description: input.role
          ? `${name} is now ${roleName(input.role)} on this project`
          : `${name} no longer has a role on this project`,
        duration: 2000,
      });
    },
  });
}
