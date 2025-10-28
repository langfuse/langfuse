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
      className="flex items-center gap-2"
      icon={
        <>
          <Folder className="h-4 w-4" />
          {name}
        </>
      }
      onClick={onClick}
      title={name || ""}
    />
  );
};
