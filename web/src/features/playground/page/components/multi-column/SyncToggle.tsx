import React from "react";
import { Link, Unlink } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import { type SyncSettings } from "@/src/features/playground/page/types";

interface SyncToggleProps {
  syncKey: keyof SyncSettings;
  isEnabled: boolean;
  onToggle: () => void;
  className?: string;
}

export const SyncToggle: React.FC<SyncToggleProps> = ({
  syncKey,
  isEnabled,
  onToggle,
  className,
}) => {
  const getTooltipContent = () => {
    const settingName = {
      modelParams: "Model settings",
      tools: "Tools",
      structuredOutputSchema: "Structured output",
      messages: "Messages",
    }[syncKey];

    return isEnabled
      ? `${settingName} synced across all columns. Click to unlink.`
      : `${settingName} independent per column. Click to sync.`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
              "h-6 w-6 p-0 transition-colors",
              isEnabled 
                ? "text-blue-600 hover:text-blue-700" 
                : "text-gray-400 hover:text-gray-600",
              className
            )}
          >
            {isEnabled ? (
              <Link className="h-4 w-4" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{getTooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};