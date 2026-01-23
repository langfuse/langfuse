import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { type EventsViewMode } from "@/src/features/events/hooks/useEventsViewMode";

export interface EventsViewModeToggleProps {
  viewMode: EventsViewMode;
  onViewModeChange: (mode: EventsViewMode) => void;
}

export function EventsViewModeToggle({
  viewMode,
  onViewModeChange,
}: EventsViewModeToggleProps) {
  return (
    <Tabs
      value={viewMode}
      onValueChange={(value) => onViewModeChange(value as EventsViewMode)}
    >
      <TabsList className="h-8 p-0.5">
        <TabsTrigger value="trace" className="h-7 px-2 text-xs">
          Traces
        </TabsTrigger>
        <TabsTrigger value="observation" className="h-7 px-2 text-xs">
          Observations
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
