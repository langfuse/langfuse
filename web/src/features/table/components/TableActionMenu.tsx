import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { X, Trash } from "lucide-react";
import { Plus } from "lucide-react";
import {
  type TableAction,
  type CustomDialogTableAction,
} from "@/src/features/table/types";
import { TableActionDialog } from "@/src/features/table/components/TableActionDialog";
import { type BatchExportTableName } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

type TableActionMenuProps = {
  projectId: string;
  actions: TableAction[];
  tableName: BatchExportTableName;
  selectedCount: number;
  onClearSelection: () => void;
  onCustomAction?: (actionType: CustomDialogTableAction["id"]) => void;
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
  selectedCount,
  onClearSelection,
  onCustomAction,
}: TableActionMenuProps) {
  const [selectedAction, setSelectedAction] = useState<TableAction | null>(
    null,
  );
  const [isDialogOpen, setDialogOpen] = useState(false);

  const handleActionSelect = (action: TableAction) => {
    if ("customDialog" in action && action.customDialog) {
      onCustomAction?.(action.id);
      return;
    }
    setSelectedAction(action);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setSelectedAction(null);
    setDialogOpen(false);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <div className="bg-background/95 border-border pointer-events-auto flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="text-sm font-medium">
            {`${selectedCount} selected`}
          </div>
          <div className="bg-border h-5 w-px" />
          <div className="flex items-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className={cn("h-8")}
                onClick={() => handleActionSelect(action)}
              >
                {action.icon || getDefaultIcon(action.type)}
                <span>{action.label}</span>
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
