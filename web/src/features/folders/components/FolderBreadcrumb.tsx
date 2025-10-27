import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { createBreadcrumbItems } from "@/src/features/folders/utils";
import { Home, Slash } from "lucide-react";

/**
 * Breadcrumb navigation for folders.
 *
 * @param currentFolderPath - Name-based folder path for navigation
 * @param navigateToFolder - Callback to navigate to a folder
 */
export const FolderBreadcrumb = ({
  currentFolderPath,
  navigateToFolder,
}: {
  currentFolderPath: string;
  navigateToFolder: (folderPath: string | undefined) => void;
}) => {
  return (
    <div className="ml-2 pt-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer hover:underline"
              onClick={() => navigateToFolder(undefined)}
            >
              <Home className="h-4 w-4" />
            </BreadcrumbLink>
          </BreadcrumbItem>
          {createBreadcrumbItems(currentFolderPath).flatMap(
            (item, index, array) => [
              index > 0 && (
                <BreadcrumbSeparator key={`sep-${item.folderPath}`}>
                  <Slash />
                </BreadcrumbSeparator>
              ),
              <BreadcrumbItem key={item.folderPath}>
                {index === array.length - 1 ? (
                  <BreadcrumbPage>{item.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer hover:underline"
                    onClick={() => navigateToFolder(item.folderPath)}
                  >
                    {item.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>,
            ],
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};
