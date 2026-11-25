import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { api } from "@/src/utils/api";

/** useSetGroupProjectRole sets or removes a group's role on a project and confirms it in a toast. */
export function useSetGroupProjectRole(groupName: (groupId: string) => string) {
  const utils = api.useUtils();
  return api.groups.setProjectRole.useMutation({
    onSuccess: (_, input) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
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
