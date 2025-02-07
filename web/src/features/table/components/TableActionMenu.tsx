import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDown, Trash } from "lucide-react";
import { Plus } from "lucide-react";
import { type TableAction } from "@/src/features/table/types";
import { TableActionDialog } from "@/src/features/table/components/TableActionDialog";
import { type BatchExportTableName } from "@langfuse/shared";

type TableActionMenuProps = {
  projectId: string;
  actions: TableAction[];
  tableName: BatchExportTableName;
};

const getDefaultIcon = (type: TableAction["type"]) => {
  if (type === "create") {
    return <Plus className="mr-2 h-4 w-4" />;
  }
  return <Trash className="mr-2 h-4 w-4" />;
};

export function TableActionMenu({
  projectId,
  actions,
  tableName,
}: TableActionMenuProps) {
  const [selectedAction, setSelectedAction] = useState<TableAction | null>(
    null,
  );
  const [isDialogOpen, setDialogOpen] = useState(false);

  const handleActionSelect = (action: TableAction) => {
    setSelectedAction(action);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setSelectedAction(null);
    setDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Actions
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onClick={() => handleActionSelect(action)}
            >
              {action.icon || getDefaultIcon(action.type)}
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedAction && (
        <TableActionDialog
          isOpen={isDialogOpen}
          onClose={handleClose}
          action={selectedAction}
          projectId={projectId}
          tableName={tableName}
        />
      )}
    </>
  );
}
