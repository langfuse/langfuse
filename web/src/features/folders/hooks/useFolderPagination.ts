import {
  useQueryParams,
  withDefault,
  NumberParam,
  StringParam,
} from "use-query-params";

/**
 * Hook for managing pagination with folder navigation support.
 *
 * Handles:
 * - URL query params for pageIndex, pageSize, folder path, and optional display path
 * - Folder navigation with automatic pagination reset
 * - Pagination reset while preserving folder context
 * - Dual-path tracking for datasets (ID-based navigation + name-based display)
 *
 * Path handling:
 * - Prompts: Use name-based paths for both navigation and display (displayPath not needed)
 * - Datasets: Use ID-based paths for navigation, name-based paths for breadcrumb display
 *
 * @example
 * ```tsx
 * // Prompts (name-based)
 * const { currentFolderPath, navigateToFolder } = useFolderPagination();
 * navigateToFolder("folder1/folder2"); // Uses names for both URL and display
 *
 * // Datasets (ID-based navigation, name-based display)
 * const { currentFolderPath, currentDisplayPath, navigateToFolder } = useFolderPagination();
 * navigateToFolder("id1/id2", "name1/name2"); // URL uses IDs, breadcrumb shows names
 * ```
 */
export const useFolderPagination = () => {
  const [queryParams, setQueryParams] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
    folder: StringParam,
    folderDisplay: StringParam,
  });

  const currentFolderPath = queryParams.folder || "";
  const currentDisplayPath = queryParams.folderDisplay || "";

  /**
   * Navigate to a folder, resetting pagination to page 0
   * @param folderPath - The folder path to navigate to, or undefined for root
   * @param displayPath - Optional display name path for breadcrumbs (required for datasets)
   */
  const navigateToFolder = (
    folderPath: string | undefined,
    displayPath?: string,
  ) => {
    setQueryParams({
      folder: folderPath,
      folderDisplay: displayPath,
      pageIndex: 0, // Reset to first page when changing folders
      pageSize: queryParams.pageSize,
    });
  };

  /**
   * Reset pagination to page 0 while preserving current folder
   * Useful for search/filter changes
   */
  const resetPaginationAndFolder = () => {
    setQueryParams({
      pageIndex: 0,
      pageSize: queryParams.pageSize,
      folder: queryParams.folder,
      folderDisplay: queryParams.folderDisplay,
    });
  };

  return {
    /**
     * Current folder path from URL query params
     * Empty string if at root
     */
    currentFolderPath,

    /**
     * Current display path for breadcrumbs
     * Empty string if at root
     */
    currentDisplayPath,

    /**
     * Pagination state for table component
     */
    paginationState: {
      pageIndex: queryParams.pageIndex,
      pageSize: queryParams.pageSize,
    },

    /**
     * Function to update pagination state
     * Pass to DataTable's pagination.onChange
     */
    setPaginationAndFolderState: setQueryParams,

    /**
     * Navigate to a folder with automatic pagination reset
     */
    navigateToFolder,

    /**
     * Reset pagination to page 0 while preserving folder
     */
    resetPaginationAndFolder,
  };
};

export type UseFolderPaginationReturn = ReturnType<typeof useFolderPagination>;
