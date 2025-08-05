import { useState } from "react";
import { api } from "@/src/utils/api";
import { Input } from "@/src/components/ui/input";
import { Search, Check, MoreHorizontal } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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
  const hasProjectMembersReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "projectMembers:read",
  });
  const hasQueueMembersReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueueMembers:read",
  });

  const [searchQuery, setSearchQuery] = useState("");

  // Get current selected users
  const queueMembersQuery = api.annotationQueueMemberships.byQueueId.useQuery(
    { projectId, queueId: queueId as string },
    { enabled: !!queueId && hasQueueMembersReadAccess },
  );

  // Get all project users
  const allUsers = api.members.byProjectId.useQuery(
    {
      projectId,
      searchQuery: searchQuery || undefined,
      page: 0,
      limit: 50,
    },
    {
      enabled: hasProjectMembersReadAccess,
    },
  );

  const handleUserToggle = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      // Remove from selection
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      // Add to selection
      onChange([...selectedUserIds, userId]);
    }
  };

  // Filter selected users from all users data
  const currentMembersSet = new Set(
    queueMembersQuery.data?.members.map((m) => m.id) || [],
  );

  // Filter available users (not already assigned to queue)
  const availableUsers =
    allUsers.data?.users.filter((user) => !currentMembersSet.has(user.id)) ||
    [];

  // Check if there are more results than shown
  const hasMoreResults =
    allUsers.data && allUsers.data.totalCount > allUsers.data.users.length;

  // Check if there are more assigned users than shown
  const hasMoreAssignedUsers =
    queueMembersQuery.data &&
    queueMembersQuery.data.totalCount > queueMembersQuery.data.members.length;

  return (
    <div className="space-y-4">
      {/* Assigned Users Section */}
      {queueMembersQuery.data && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Assigned Users ({queueMembersQuery.data?.totalCount})
          </h4>
          <div className="max-h-32 overflow-y-auto rounded-md border bg-background">
            {queueMembersQuery.data?.members.map((user, index) => (
              <div key={user.id}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="truncate text-sm font-medium">
                        {user.name || "Unnamed User"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
                {(index < queueMembersQuery.data?.members.length - 1 ||
                  hasMoreAssignedUsers) && (
                  <div className="border-b border-border/50" />
                )}
              </div>
            ))}
            {hasMoreAssignedUsers && (
              <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm italic">
                    {queueMembersQuery.data.totalCount -
                      queueMembersQuery.data.members.length}{" "}
                    more assigned users
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">
          Add Users ({allUsers.data?.totalCount || 0} available)
        </h4>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Available Users Results */}
        {availableUsers.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
            {availableUsers.map((user, index) => (
              <div key={user.id}>
                <div
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
                  onClick={() => handleUserToggle(user.id)}
                >
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-sm border transition-colors ${
                      selectedUserIds.includes(user.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary opacity-50"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 ${
                        selectedUserIds.includes(user.id)
                          ? "visible"
                          : "invisible"
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="truncate text-sm font-medium">
                        {user.name || "Unnamed User"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
                {(index < availableUsers.length - 1 || hasMoreResults) && (
                  <div className="border-b border-border/50" />
                )}
              </div>
            ))}
            {hasMoreResults && (
              <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-sm italic">
                      {allUsers.data.totalCount - allUsers.data.users.length}{" "}
                      more users, add a search term to narrow results
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border bg-background py-8 text-center text-sm text-muted-foreground">
            {searchQuery
              ? `No users found matching "${searchQuery}"`
              : "Search for users to assign to this queue"}
          </div>
        )}
      </div>
    </div>
  );
};
