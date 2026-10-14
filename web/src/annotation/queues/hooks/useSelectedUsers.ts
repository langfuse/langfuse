import { api } from "@/src/app/utils/api";
import { useHasProjectAccess } from "@/src/identity/access-control";

interface UseSelectedUsersProps {
  projectId: string;
  selectedUserIds: string[];
}

export function useSelectedUsers({
  projectId,
  selectedUserIds,
}: UseSelectedUsersProps) {
  const hasProjectMembersReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "projectMembers:read",
  });

  // Get all users without search filter to maintain selected users data
  const allUsersForPills = api.members.byProjectId.useQuery(
    {
      projectId,
    },
    {
      enabled: hasProjectMembersReadAccess && selectedUserIds.length > 0,
    },
  );

  const selectedUsers =
    allUsersForPills.data?.users.filter((user) =>
      selectedUserIds.includes(user.id),
    ) || [];

  return {
    selectedUsers,
    isLoading: allUsersForPills.isLoading,
  };
}
