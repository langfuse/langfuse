/**
 * Creates breadcrumb items from folder path.
 *
 * @param currentFolderPath - Name-based folder path
 */
export const createBreadcrumbItems = (currentFolderPath: string) => {
  if (!currentFolderPath) return [];

  const segments = currentFolderPath.split("/");

  return segments.map((name, i) => {
    const folderPath = segments.slice(0, i + 1).join("/");
    return {
      name,
      folderPath,
    };
  });
};

export const buildFullPath = (currentFolder: string, itemName: string) =>
  currentFolder ? `${currentFolder}/${itemName}` : itemName;
