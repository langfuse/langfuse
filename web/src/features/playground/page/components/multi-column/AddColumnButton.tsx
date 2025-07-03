import React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

interface AddColumnButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const AddColumnButton: React.FC<AddColumnButtonProps> = ({
  onClick,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn(
      "flex min-w-[200px] items-center justify-center p-4",
      className
    )}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={onClick}
              disabled={disabled}
              className="h-20 w-full border-dashed border-2 hover:border-solid hover:bg-muted/50 transition-all duration-200"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Add Column</span>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {disabled 
                ? "Maximum 10 columns reached" 
                : "Add a new playground column"
              }
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};