import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Info } from "lucide-react";

export function ExperimentsBetaSwitch({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex items-center gap-1">
        <Label htmlFor="experiments-beta-toggle">Experiments Beta</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="text-muted-foreground h-3.5 w-3.5 cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                View experiments decoupled from Datasets, extended filtering,
                and faster performance. Turn off anytime.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Switch
        id="experiments-beta-toggle"
        checked={enabled}
        onCheckedChange={onEnabledChange}
      />
    </div>
  );
}
