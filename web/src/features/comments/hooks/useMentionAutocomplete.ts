import { useState } from "react";
import { useUserSearch } from "@/src/hooks/useUserSearch";

export function useMentionAutocomplete({
  projectId,
  enabled,
  onOpenChange,
}: {
  projectId: string;
  enabled: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const showDropdown = enabled && mentionStartPos !== null;
  const userSearch = useUserSearch({
    projectId,
    limit: 10,
    enabled: showDropdown,
  });

  function closeDropdown() {
    setMentionStartPos(null);
    userSearch.setSearchQuery("");
    onOpenChange?.(false);
  }

  function updateQuery(value: string, cursorPosition: number) {
    if (!enabled) return;
    const beforeCursor = value.slice(0, cursorPosition);
    const match = /(?:^|\s)@([^\s@[\]()]*)$/.exec(beforeCursor);
    if (!match) {
      closeDropdown();
      return;
    }
    const query = match[1];
    setMentionStartPos(cursorPosition - query.length - 1);
    if (query !== userSearch.searchQuery) setSelectedIndex(0);
    userSearch.setSearchQuery(query);
    onOpenChange?.(true);
  }

  return {
    showDropdown,
    users: userSearch.searchResults,
    isLoading: userSearch.isLoading,
    selectedIndex:
      selectedIndex < userSearch.searchResults.length ? selectedIndex : 0,
    setSelectedIndex,
    mentionStartPos,
    closeDropdown,
    updateQuery,
  };
}
