import { useState, useEffect, useCallback } from "react";
import { api } from "@/src/utils/api";

export function useMentionAutocomplete({
  projectId,
  textareaValue,
  cursorPosition,
  enabled,
}: {
  projectId: string;
  textareaValue: string;
  cursorPosition: number;
  enabled: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users
  const { data, isLoading } = api.members.byProjectId.useQuery(
    {
      projectId,
      searchQuery: debouncedQuery || undefined,
      limit: 10,
      page: 0, // Always first page for autocomplete
    },
    {
      enabled: enabled && showDropdown,
    },
  );
  const users = data?.users || [];

  // Detect @ character and update state
  useEffect(() => {
    if (!enabled) return;

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
  }, [textareaValue, cursorPosition, enabled]);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setMentionStartPos(null);
    setSearchQuery("");
  }, []);

  return {
    showDropdown,
    users,
    isLoading,
    selectedIndex,
    setSelectedIndex,
    mentionStartPos,
    closeDropdown,
  };
}
