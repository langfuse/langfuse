/**
 * Creates breadcrumb items from folder path.
 *
 * @param currentFolderPath - Path used for navigation (IDs for datasets, names for prompts)
 * @param displayPath - Optional display path for showing human-readable names in breadcrumbs
 *                      (required for datasets where navigation uses IDs but display needs names)
 */
export const createBreadcrumbItems = (
  currentFolderPath: string,
  displayPath?: string,
) => {
  if (!currentFolderPath) return [];

  const segments = currentFolderPath.split("/");
  const displaySegments = displayPath?.split("/") ?? segments;

  return segments.map((name, i) => {
    const folderPath = segments.slice(0, i + 1).join("/");
    const displayName = displaySegments[i] ?? name;
    return {
      name: displayName,
      folderPath,
    };
  });
};

export const buildFullPath = (currentFolder: string, itemName: string) =>
  currentFolder ? `${currentFolder}/${itemName}` : itemName;
