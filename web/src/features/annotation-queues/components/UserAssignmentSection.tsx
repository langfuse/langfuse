import { type RouterOutputs } from "@/src/utils/api";
import { MoreHorizontal, X } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { MultiSelectCombobox } from "@/src/components/ui/MultiSelectCombobox";
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
  const selectedUsers = users.filter((user) =>
    selectedUserIds.includes(user.id),
  );
  const handleUsersChange = (users: typeof searchResults) => {
    const userIds = users.map((user) => user.id);
    onChange(userIds);
  };

  const hasMoreAssignedUsers = totalAssignedUsers > assignedUsers.length;

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* User Selection Combobox */}
      <MultiSelectCombobox
        selectedItems={selectedUsers}
        onItemsChange={handleUsersChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchResults={searchResults.filter(
          (user) => !selectedUserIds.includes(user.id),
        )}
        isLoading={isLoading}
        disabled={!canWrite}
        placeholder="Search users to add..."
        hasMoreResults={hasMoreResults}
        getItemKey={(user) => user.id}
        onOpenChange={(open) => {
          if (open) {
            setTimeout(() => {
              containerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 100);
          }
        }}
        renderSelectedItem={(user, onRemove) => {
          const userLabel = user.name || user.email;

          return (
            <div className="bg-muted flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs">
              <span className="max-w-32 truncate" title={userLabel}>
                {userLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-muted-foreground/20 h-4 w-4 p-0"
                onClick={onRemove}
              >
                <X size="base" color="default" />
              </Button>
            </div>
          );
        }}
        renderItem={(user, isSelected, onToggle) => {
          const userName = user.name || "Unnamed User";

          return (
            <div
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors"
              onClick={onToggle}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="truncate text-xs font-bold" title={userName}>
                    {userName}
                  </p>
                  <p
                    className="text-muted-foreground truncate text-xs"
                    title={user.email}
                  >
                    {user.email}
                  </p>
                </div>
              </div>
              {isSelected && (
                <div className="text-muted-foreground text-xs">✓</div>
              )}
            </div>
          );
        }}
      />

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
