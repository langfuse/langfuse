import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useUserSearch } from "@/src/hooks/useUserSearch";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export function useQueueUserAssignments({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string | undefined;
}) {
  const canRead = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });
  const canWrite = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:CUD",
  });
  const canReadMembers = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });
  const utils = api.useUtils();
  const assignments = api.annotationQueueAssignments.byQueueId.useQuery(
    { projectId, queueId: queueId ?? "" },
    { enabled: Boolean(queueId) && canRead },
  );
  const users = api.members.byProjectId.useQuery(
    { projectId },
    { enabled: canRead && canReadMembers },
  );
  const assignedUsers = assignments.data?.assignments ?? [];
  const search = useUserSearch({
    projectId,
    excludeUserIds: assignedUsers.map((user) => user.id),
    enabled: canRead,
  });
  const remove = api.annotationQueueAssignments.delete.useMutation({
    onSuccess: () => {
      utils.annotationQueueAssignments.invalidate();
      utils.annotationQueues.invalidate();
      showSuccessToast({
        operation: "annotation_queue_assignment.remove",
        title: "Removed assignment",
        description: "User removed from queue successfully",
      });
    },
  });

  return {
    users: users.data?.users ?? [],
    assignedUsers,
    totalAssignedUsers: assignments.data?.totalCount ?? 0,
    searchQuery: search.searchQuery,
    onSearchChange: search.setSearchQuery,
    searchResults: search.searchResults,
    isLoading: search.isLoading,
    hasMoreResults: search.hasMoreResults,
    canWrite,
    isRemoving: remove.isPending,
    onRemove: (userId: string) => {
      if (!queueId || !canWrite) return;
      remove.mutate({ projectId, queueId, userId });
    },
  };
}
