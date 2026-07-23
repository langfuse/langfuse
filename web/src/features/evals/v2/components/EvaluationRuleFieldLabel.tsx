import { InfoIcon } from "lucide-react";
import { type ReactNode } from "react";

import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export function EvaluationRuleFieldLabel({
  htmlFor,
  children,
  tooltip,
}: {
  htmlFor?: string;
  children: ReactNode;
  tooltip: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      <Tooltip>
        <TooltipTrigger asChild>
          <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </Label>
  );
}
