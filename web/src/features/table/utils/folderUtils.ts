export interface FolderableItem {
  id: string;
  name: string;
}

export interface FolderRow {
  id: string;
  name: string;
  type: "folder";
}

export function isFolder<T extends { type: string }>(
  row: T,
): row is T & { type: "folder" } {
  return row.type === "folder";
}

export function getDisplayName(fullPath: string, currentFolderPath: string): string {
  return currentFolderPath === ""
    ? fullPath
    : fullPath.substring(currentFolderPath.length + 1);
}

export function createBreadcrumbItems(currentFolderPath: string) {
  if (!currentFolderPath) return [];
  
  const segments = currentFolderPath.split("/");
  return segments.map((name, i) => {
    const folderPath = segments.slice(0, i + 1).join("/");
    return {
      name,
      folderPath,
    };
  });
}

/**
 * Process a list of items that can be organized into folders based on their names.
 * Items with "/" in their names create virtual folders.
 * 
 * @param items - Array of items that have id and name properties
 * @param currentFolderPath - Current folder path for filtering
 * @param createItemRow - Function to create a row for an actual item
 * @param createFolderRow - Function to create a row for a virtual folder
 * @returns Array of combined folder and item rows, folders first
 */
export function processFolderableItems<T extends FolderableItem, ItemRow, FolderRow>(
  items: T[],
  currentFolderPath: string,
  createItemRow: (item: T) => ItemRow,
  createFolderRow: (folderPath: string, folderName: string) => FolderRow,
): Array<ItemRow | FolderRow> {
  const uniqueFolders = new Set<string>();
  const matchingItems: T[] = [];

  // Process items to extract folders and filter by current path
  for (const item of items) {
    const itemName = item.name;

    if (currentFolderPath) {
      const prefix = `${currentFolderPath}/`;
      if (itemName.startsWith(prefix)) {
        const remainingPath = itemName.substring(prefix.length);
        const slashIndex = remainingPath.indexOf("/");

        if (slashIndex > 0) {
          // Subfolder
          const subFolderName = remainingPath.substring(0, slashIndex);
          const fullSubFolderPath = `${currentFolderPath}/${subFolderName}`;
          uniqueFolders.add(fullSubFolderPath);
        } else {
          // Direct item in current folder
          matchingItems.push(item);
        }
      }
    } else {
      // Root level
      const slashIndex = itemName.indexOf("/");
      if (slashIndex > 0) {
        const folderName = itemName.substring(0, slashIndex);
        uniqueFolders.add(folderName);
      } else {
        matchingItems.push(item);
      }
    }
  }

  // Create combined rows: folders first, then items
  const combinedRows: Array<ItemRow | FolderRow> = [];

  // Add folder rows
  for (const folderPath of uniqueFolders) {
    const folderName = getDisplayName(folderPath, currentFolderPath);
    combinedRows.push(createFolderRow(folderPath, folderName));
  }

  // Add matching items
  for (const item of matchingItems) {
    combinedRows.push(createItemRow(item));
  }

  return combinedRows;
}