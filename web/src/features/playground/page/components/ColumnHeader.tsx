import React from "react";
import { XIcon, SaveIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SaveColumnPromptButton } from "./SaveColumnPromptButton";

interface ColumnHeaderProps {
  title: string;
  columnId: string;
  onRemove: () => void;
  canRemove: boolean;
  modelName?: string;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  title,
  columnId,
  onRemove,
  canRemove,
  modelName,
}) => {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/30">
      <div className="flex flex-col">
        <h3 className="font-medium text-sm">{title}</h3>
        {modelName && (
          <span className="text-xs text-muted-foreground">{modelName}</span>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <SaveColumnPromptButton columnId={columnId} />
        
        {canRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onRemove}
            title="Remove column"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};