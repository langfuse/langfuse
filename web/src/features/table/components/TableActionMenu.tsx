import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { X, Trash } from "lucide-react";
import { Plus } from "lucide-react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import {
  type TableAction,
  type CustomDialogTableAction,
} from "@/src/features/table/types";
import { TableActionDialog } from "@/src/features/table/components/TableActionDialog";
import { type BatchExportTableName } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { numberFormatter } from "@/src/utils/numbers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

type TableActionMenuProps = {
  projectId: string;
  actions: TableAction[];
  tableName: BatchExportTableName;
  selectedCount: number | null;
  onClearSelection: () => void;
  onCustomAction?: (actionType: CustomDialogTableAction["id"]) => void;
};

const getDefaultIcon = (type: TableAction["type"]) => {
  if (type === "create") {
    return <Plus className="h-4 w-4 sm:mr-2" />;
  }
  return <Trash className="h-4 w-4 sm:mr-2" />;
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
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center">
        <div className="ring-dark-blue/20 dark:border-dark-blue/30 dark:ring-dark-blue/30 bg-background pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 opacity-95 shadow-lg ring-2 backdrop-blur-md dark:shadow-none">
          <div className="text-sm font-medium">
            {selectedCount !== null ? (
              <span> {`${numberFormatter(selectedCount, 0)} selected`}</span>
            ) : (
              <Spinner size="sm" />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="bg-border h-5 w-px" />
          <div className="flex items-center gap-2">
            {actions.map((action) => {
              const menuItem = (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  className={cn("h-8")}
                  title={action.label}
                  disabled={action.disabled}
                  onClick={() => handleActionSelect(action)}
                >
                  {action.icon || getDefaultIcon(action.type)}
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              );

              if (action.disabled && action.disabledReason) {
                return (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <span>{menuItem}</span>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {action.disabledReason}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return menuItem;
            })}
          </div>
        </div>
      </div>

      {selectedAction && (
        <TableActionDialog
          isOpen={isDialogOpen}
          onClose={handleClose}
          onSuccess={onClearSelection}
          action={selectedAction}
          projectId={projectId}
          tableName={tableName}
        />
      )}
    </>
  );
}
