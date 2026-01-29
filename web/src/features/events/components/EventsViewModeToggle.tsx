import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDown } from "lucide-react";
import { type EventsViewMode } from "@/src/features/events/hooks/useEventsViewMode";

export interface EventsViewModeToggleProps {
  viewMode: EventsViewMode;
  onViewModeChange: (mode: EventsViewMode) => void;
}

const VIEW_MODE_OPTIONS: Record<
  EventsViewMode,
  { label: string; description: string }
> = {
  trace: {
    label: "Traces",
    description: "Root-level observations, the top nodes in a trace.",
  },
  observation: {
    label: "Observations",
    description: "All observations of all trace trees.",
  },
};

export function EventsViewModeToggle({
  viewMode,
  onViewModeChange,
}: EventsViewModeToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {VIEW_MODE_OPTIONS[viewMode].label}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(
          Object.entries(VIEW_MODE_OPTIONS) as [
            EventsViewMode,
            { label: string; description: string },
          ][]
        ).map(([key, { label, description }]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onViewModeChange(key)}
            className="flex flex-col items-start"
          >
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
