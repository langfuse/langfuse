import { type RouterOutputs } from "@/src/utils/api";
import { MoreHorizontal, X } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { AsyncMultiSelectTagInput } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { useRef } from "react";

interface UserAssignmentSectionProps {
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  users: RouterOutputs["members"]["byProjectId"]["users"];
  assignedUsers: RouterOutputs["annotationQueueAssignments"]["byQueueId"]["assignments"];
  totalAssignedUsers: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: RouterOutputs["members"]["byProjectId"]["users"];
  isLoading: boolean;
  hasMoreResults: boolean;
  canWrite: boolean;
  isRemoving: boolean;
  onRemove: (userId: string) => void;
}

export const UserAssignmentSection = ({
  selectedUserIds,
  onChange,
  users,
  assignedUsers,
  totalAssignedUsers,
  searchQuery,
  onSearchChange,
  searchResults,
  isLoading,
  hasMoreResults,
  canWrite,
  isRemoving,
  onRemove,
}: UserAssignmentSectionProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedUsers = selectedUserIds.map((id) => {
    const user = users.find((user) => user.id === id);
    return { value: id, label: user?.name || user?.email || id };
  });

  const hasMoreAssignedUsers = totalAssignedUsers > assignedUsers.length;

  return (
    <div className="space-y-4" ref={containerRef}>
      <AsyncMultiSelectTagInput
        aria-label="Users to assign"
        value={selectedUsers}
        onValueChange={(selection) =>
          onChange(selection.map(({ value }) => value))
        }
        search={{
          value: searchQuery,
          onValueChange: onSearchChange,
          placeholder: "Search users to add...",
        }}
        options={searchResults
          .filter((user) => !selectedUserIds.includes(user.id))
          .map((user) => ({
            value: user.id,
            label: user.name || user.email,
            secondaryLabel: user.name ? user.email : undefined,
          }))}
        loading={isLoading ? { message: "Loading users..." } : undefined}
        disabled={!canWrite}
        placeholder="Search users to add..."
        emptyMessage="No users found."
        onAfterOpenChange={(open) => {
          if (open) {
            setTimeout(() => {
              containerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 100);
          }
        }}
      />
      {hasMoreResults && !isLoading && (
        <p className="text-muted-foreground text-xs">
          More results available, refine your search.
        </p>
      )}

      {/* Assigned Users Section */}
      {totalAssignedUsers > 0 && (
        <div className="space-y-2">
          <h4 className="text-muted-foreground text-sm">
            Assigned to ({totalAssignedUsers})
          </h4>
          <div className="bg-background max-h-32 overflow-y-auto rounded-md border">
            {assignedUsers.map((user, index) => {
              const userName = user.name || "Unnamed User";

              return (
                <div key={user.id}>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p
                          className="truncate text-xs font-bold"
                          title={userName}
                        >
                          {userName}
                        </p>
                        <p
                          className="text-muted-foreground truncate text-xs"
                          title={user.email ?? undefined}
                        >
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canWrite || isRemoving}
                      onClick={() => onRemove(user.id)}
                    >
                      <X size="base" color="default" />
                    </Button>
                  </div>
                  {(index < assignedUsers.length - 1 ||
                    hasMoreAssignedUsers) && (
                    <div className="border-border/50 border-b" />
                  )}
                </div>
              );
            })}
            {hasMoreAssignedUsers && (
              <div className="text-muted-foreground flex items-center gap-3 px-3 py-2">
                <MoreHorizontal size="base" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs italic">
                    {totalAssignedUsers - assignedUsers.length} more assigned
                    users
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
