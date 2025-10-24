import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
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
  onClose: () => void;
  onSelectedIndexChange: (index: number) => void;
}

export function MentionAutocomplete({
  users,
  isLoading,
  selectedIndex,
  onSelect,
  onClose: _onClose,
  onSelectedIndexChange,
}: MentionAutocompleteProps) {
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Get the currently selected user's ID for Command's value prop
  const selectedUserId = users[selectedIndex]?.id;

  // Limit displayed users to first 3
  const MAX_DISPLAYED_USERS = 3;
  const displayedUsers = users.slice(0, MAX_DISPLAYED_USERS);
  const remainingCount = users.length - MAX_DISPLAYED_USERS;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-1"
      role="region"
      aria-label="User mention suggestions"
    >
      <Command
        className="max-h-60 rounded-md border shadow-md"
        value={selectedUserId}
        aria-label="Mention user autocomplete"
      >
        <CommandList
          role="listbox"
          aria-activedescendant={selectedUserId || ""}
        >
          {isLoading && (
            <div
              className="flex items-center justify-center p-3"
              role="status"
              aria-live="polite"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span className="sr-only">Loading users...</span>
            </div>
          )}
          {!isLoading && users.length === 0 && (
            <CommandEmpty role="status">No users found</CommandEmpty>
          )}
          {!isLoading && users.length > 0 && (
            <>
              <CommandGroup>
                {displayedUsers.map((user, index) => {
                  const displayName = user.name || user.email || "User";
                  const isSelected = index === selectedIndex;
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
                      <Avatar className="h-6 w-6" aria-hidden="true">
                        <AvatarFallback className="text-xs">
                          {user.name ? user.name[0] : user.email?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden text-foreground">
                        <div className="truncate font-medium">
                          {user.name || "Unknown"}
                        </div>
                        {user.email && (
                          <div className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {remainingCount > 0 && (
                <div
                  className="border-t px-2 py-2 text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  and {remainingCount} more...
                </div>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
