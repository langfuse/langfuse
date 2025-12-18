import TableLink from "@/src/components/table/table-link";
import { Folder } from "lucide-react";

export const FolderBreadcrumbLink = ({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) => {
  return (
    <TableLink
      path={""}
      value={name} // To satisfy table-link, fallback
      icon={
        <div className="flex flex-row items-center gap-1">
          <Folder className="h-4 w-4" />
          {name}
        </div>
      }
      onClick={onClick}
      title={name || ""}
    />
  );
};
