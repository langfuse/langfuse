import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Input } from "@/src/components/ui/input";
import { Search, Check, MoreHorizontal, Trash2 } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";

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
  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueueAssignments:read",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Get current assigned users
  const queueAssignmentsQuery =
    api.annotationQueueAssignments.byQueueId.useQuery(
      { projectId, queueId: queueId as string },
      { enabled: !!queueId && hasQueueAssignmentsReadAccess },
    );

  // Get all project users
  const allUsers = api.members.byProjectId.useQuery(
    {
      projectId,
      searchQuery: debouncedSearchQuery || undefined,
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

  // Check if there are more results than shown
  const hasMoreResults =
    allUsers.data && allUsers.data.totalCount > allUsers.data.users.length;

  // Check if there are more assigned users than shown
  const hasMoreAssignedUsers =
    queueAssignmentsQuery.data &&
    queueAssignmentsQuery.data.totalCount >
      queueAssignmentsQuery.data.assignments.length;

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 text-xs"
            />
            <div className="absolute right-2 top-1">
              <span className="rounded-sm bg-input px-1 text-xs">
                {selectedUserIds.length}/{allUsers.data?.totalCount || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Available Users Results */}
        {allUsers.data && allUsers.data.users.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
            {allUsers.data.users.map((user, index) => (
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
                      <p className="truncate text-xs font-medium">
                        {user.name || "Unnamed User"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
                {(index < allUsers.data.users.length - 1 || hasMoreResults) && (
                  <div className="border-b border-border/50" />
                )}
              </div>
            ))}
            {hasMoreResults && (
              <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-xs italic">
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
              ? `No users found`
              : "Search for users to assign to this queue"}
          </div>
        )}
      </div>

      {/* Assigned Users Section */}
      {queueAssignmentsQuery.data && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
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
                    <Button variant="ghost" size="icon-sm">
                      <Trash2 className="h-3 w-3" />
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
