import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { cn } from "@/src/utils/tailwind";

export function V4BetaSidebarToggle() {
  const { isBetaEnabled, setBetaEnabled, isLoading } = useV4Beta();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex h-8 w-full items-center gap-2 overflow-hidden p-2 text-left text-sm",
            "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
          )}
        >
          <Switch
            id="v4-beta-toggle"
            size="sm"
            checked={isBetaEnabled}
            onCheckedChange={setBetaEnabled}
            disabled={isLoading}
            className="shrink-0"
          />
          <Label
            htmlFor="v4-beta-toggle"
            className="cursor-pointer text-sm font-normal group-data-[collapsible=icon]:hidden"
          >
            v4 Beta
          </Label>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Toggle to use new events based v4 architecture.
      </TooltipContent>
    </Tooltip>
  );
}
