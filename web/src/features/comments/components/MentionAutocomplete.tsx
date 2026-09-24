import { useEffect, useRef } from "react";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";

interface User {
  id: string;
  name: string | null;
  email: string | null;
}

interface MentionAutocompleteProps {
  users: User[];
  isLoading: boolean;
  selectedIndex: number;
  onSelect: (userId: string, displayName: string) => void;
  onSelectedIndexChange: (index: number) => void;
}

export function MentionAutocomplete({
  users,
  isLoading,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
}: MentionAutocompleteProps) {
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Get the currently selected user's ID for Command's value prop
  const selectedUserId = users[selectedIndex]?.id;

  return (
    <div
      className="ph-no-capture min-w-0"
      role="region"
      aria-label="User mention suggestions"
    >
      <Command
        className="rounded-md"
        value={selectedUserId}
        shouldFilter={false}
        aria-label="Mention user autocomplete"
      >
        <CommandList
          role="listbox"
          className="max-h-44"
          aria-label="People to mention"
        >
          {isLoading && (
            <div
              className="flex items-center justify-center p-3"
              role="status"
              aria-live="polite"
            >
              <Spinner size="sm" />
              <span className="sr-only">Loading users...</span>
            </div>
          )}
          {!isLoading && users.length === 0 && (
            <CommandEmpty role="status">No users found</CommandEmpty>
          )}
          {!isLoading && users.length > 0 && (
            <>
              <CommandGroup>
                {users.map((user, index) => {
                  const displayName = user.name || user.email || "User";
                  const isSelected = index === selectedIndex;
                  const userLabel = displayName;
                  return (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => onSelect(user.id, displayName)}
                      onMouseEnter={() => onSelectedIndexChange(index)}
                      ref={isSelected ? selectedItemRef : null}
                      role="option"
                      aria-selected={isSelected}
                      id={user.id}
                    >
                      <Avatar
                        size="sm"
                        aria-hidden="true"
                        displayName={displayName}
                      />
                      <div className="text-foreground flex-1 overflow-hidden">
                        <div className="truncate font-bold" title={userLabel}>
                          {userLabel}
                        </div>
                        {user.email && (
                          <div
                            className="text-muted-foreground truncate text-xs"
                            title={user.email}
                          >
                            {user.email}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
