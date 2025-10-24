import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

interface UseUserSearchProps {
  projectId: string;
  excludeUserIds?: string[];
  limit?: number;
  enabled?: boolean;
}

export function useUserSearch({
  projectId,
  excludeUserIds,
  limit = 50,
  enabled = true,
}: UseUserSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  const hasProjectMembersReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "projectMembers:read",
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Get search results
  const searchResults = api.members.byProjectId.useQuery(
    {
      projectId,
      searchQuery: debouncedSearchQuery || undefined,
      page: 0,
      limit,
      excludeUserIds:
        excludeUserIds && excludeUserIds.length > 0
          ? excludeUserIds
          : undefined,
    },
    {
      enabled: hasProjectMembersReadAccess && enabled,
    },
  );

  const hasMoreResults =
    searchResults.data &&
    searchResults.data.totalCount > searchResults.data.users.length;

  return {
    searchQuery,
    setSearchQuery,
    searchResults: searchResults.data?.users || [],
    isLoading: searchResults.isLoading,
    hasMoreResults: hasMoreResults || false,
  };
}
