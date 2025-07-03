import React from "react";
import { X, FileInput } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

interface ColumnHeaderProps {
  title: string;
  columnId: string;
  columnIndex: number;
  showRemove?: boolean;
  onRemove?: () => void;
  onSave?: () => void;
  className?: string;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  title,
  columnId,
  columnIndex,
  showRemove = false,
  onRemove,
  onSave,
  className,
}) => {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 border-b bg-muted/30",
      className
    )}>
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-sm text-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">
          #{columnIndex + 1}
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        {/* Save Column Button */}
        {onSave && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSave}
                  className="h-7 w-7 p-0"
                >
                  <FileInput className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Save this column as prompt</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Remove Column Button */}
        {showRemove && onRemove && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Remove column</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};