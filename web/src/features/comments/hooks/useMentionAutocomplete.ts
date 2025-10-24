import { useState, useEffect, useCallback } from "react";
import { useUserSearch } from "@/src/hooks/useUserSearch";

export function useMentionAutocomplete({
  projectId,
  getTextareaValue,
  cursorPosition,
  enabled,
}: {
  projectId: string;
  getTextareaValue: () => string;
  cursorPosition: number;
  enabled: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Use shared user search hook
  const userSearch = useUserSearch({
    projectId,
    limit: 10,
    enabled: enabled && showDropdown,
  });

  const { setSearchQuery } = userSearch;

  // Detect @ character and update state
  useEffect(() => {
    if (!enabled) return;

    const textareaValue = getTextareaValue();
    const textBeforeCursor = textareaValue.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) {
      setShowDropdown(false);
      setMentionStartPos(null);
      return;
    }

    // Check if @ is at start or preceded by whitespace
    const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
    const isValidStart = lastAtIndex === 0 || /\s/.test(charBeforeAt);

    if (!isValidStart) {
      setShowDropdown(false);
      return;
    }

    // Get text after @ (search query)
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);

    // Check if there's a space after @ (means mention is complete)
    if (/\s/.test(textAfterAt)) {
      setShowDropdown(false);
      return;
    }

    // Show dropdown
    setMentionStartPos(lastAtIndex);
    setSearchQuery(textAfterAt);
    setShowDropdown(true);
    setSelectedIndex(0);
  }, [getTextareaValue, cursorPosition, enabled, setSearchQuery]);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setMentionStartPos(null);
    setSearchQuery("");
  }, [setSearchQuery]);

  return {
    showDropdown,
    users: userSearch.searchResults,
    isLoading: userSearch.isLoading,
    selectedIndex,
    setSelectedIndex,
    mentionStartPos,
    closeDropdown,
  };
}
