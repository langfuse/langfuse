import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export function ToolExtractionWarningIcon() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label="Tool was not extracted at ingestion"
          className="inline-flex"
          tabIndex={0}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        This tool was rendered from raw input/output, but its tool definition
        name was not extracted into analytics columns at ingestion time. Tool
        filters and dashboards may not include it.
      </TooltipContent>
    </Tooltip>
  );
}
