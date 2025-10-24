import { api } from "@/src/utils/api";
import { MoreHorizontal, X } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import { MultiSelectCombobox } from "@/src/components/ui/multi-select-combobox";
import { useUserSearch } from "@/src/hooks/useUserSearch";
import { useSelectedUsers } from "@/src/features/annotation-queues/hooks/useSelectedUsers";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

interface UserAssignmentSectionProps {
  projectId: string;
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  queueId?: string;
}

export const UserAssignmentSection = ({
  projectId,
  selectedUserIds,
  onChange,
  queueId,
}: UserAssignmentSectionProps) => {
  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueueAssignments:read",
  });
  const hasQueueAssignmentWriteAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueueAssignments:CUD",
  });
  const utils = api.useUtils();

  // Get current assigned users
  const queueAssignmentsQuery =
    api.annotationQueueAssignments.byQueueId.useQuery(
      { projectId, queueId: queueId as string },
      { enabled: !!queueId && hasQueueAssignmentsReadAccess },
    );

  const deleteQueueAssignmentMutation =
    api.annotationQueueAssignments.delete.useMutation({
      onSuccess: () => {
        utils.annotationQueueAssignments.invalidate();
        utils.annotationQueues.invalidate();
        showSuccessToast({
          title: "Removed assignment",
          description: "User removed from queue successfully",
        });
      },
    });

  // Combine selected users and assigned users for exclusion
  const assignedUserIds =
    queueAssignmentsQuery.data?.assignments.map((user: any) => user.id) || [];
  const excludeUserIds = [...new Set([...selectedUserIds, ...assignedUserIds])];

  const userSearch = useUserSearch({
    projectId,
    excludeUserIds,
  });

  const { selectedUsers } = useSelectedUsers({
    projectId,
    selectedUserIds,
  });

  // Handle user selection changes
  const handleUsersChange = (users: typeof userSearch.searchResults) => {
    const userIds = users.map((user) => user.id);
    onChange(userIds);
  };

  // Handle user removal
  const handleUserRemove = (userId: string) => {
    if (!!queueId)
      deleteQueueAssignmentMutation.mutate({
        projectId,
        queueId,
        userId,
      });
  };

  // Check if there are more assigned users than shown
  const hasMoreAssignedUsers =
    queueAssignmentsQuery.data &&
    queueAssignmentsQuery.data.totalCount >
      queueAssignmentsQuery.data.assignments.length;

  return (
    <div className="space-y-4">
      {/* User Selection Combobox */}
      <MultiSelectCombobox
        selectedItems={selectedUsers}
        onItemsChange={handleUsersChange}
        searchQuery={userSearch.searchQuery}
        onSearchChange={userSearch.setSearchQuery}
        searchResults={userSearch.searchResults}
        isLoading={userSearch.isLoading}
        disabled={!hasQueueAssignmentWriteAccess}
        placeholder="Search users to add..."
        hasMoreResults={userSearch.hasMoreResults}
        getItemKey={(user) => user.id}
        renderSelectedItem={(user, onRemove) => (
          <div className="flex flex-shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="max-w-32 truncate">{user.name || user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-muted-foreground/20"
              onClick={onRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        renderItem={(user, isSelected, onToggle) => (
          <div
            className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
            onClick={onToggle}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <p className="truncate text-xs font-medium">
                  {user.name || "Unnamed User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            {isSelected && (
              <div className="text-xs text-muted-foreground">✓</div>
            )}
          </div>
        )}
      />

      {/* Assigned Users Section */}
      {queueAssignmentsQuery.data &&
        queueAssignmentsQuery.data?.totalCount > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm text-muted-foreground">
              Assigned to ({queueAssignmentsQuery.data?.totalCount})
            </h4>
            <div className="max-h-32 overflow-y-auto rounded-md border bg-background">
              {queueAssignmentsQuery.data?.assignments.map(
                (user: any, index: number) => (
                  <div key={user.id}>
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <p className="truncate text-xs font-medium">
                            {user.name || "Unnamed User"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={
                          !hasQueueAssignmentWriteAccess ||
                          deleteQueueAssignmentMutation.isPending
                        }
                        onClick={() => handleUserRemove(user.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {(index <
                      queueAssignmentsQuery.data?.assignments.length - 1 ||
                      hasMoreAssignedUsers) && (
                      <div className="border-b border-border/50" />
                    )}
                  </div>
                ),
              )}
              {hasMoreAssignedUsers && (
                <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs italic">
                      {queueAssignmentsQuery.data.totalCount -
                        queueAssignmentsQuery.data.assignments.length}{" "}
                      more assigned users
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
};
