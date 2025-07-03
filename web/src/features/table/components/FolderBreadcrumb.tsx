import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Slash, Home } from "lucide-react";
import { createBreadcrumbItems } from "../utils/folderUtils";

interface FolderBreadcrumbProps {
  currentFolderPath: string;
  onNavigate: (folderPath: string | undefined) => void;
}

export function FolderBreadcrumb({ currentFolderPath, onNavigate }: FolderBreadcrumbProps) {
  if (!currentFolderPath) return null;

  return (
    <div className="ml-2 pt-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer hover:underline"
              onClick={() => onNavigate(undefined)}
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
                    onClick={() => onNavigate(item.folderPath)}
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
}