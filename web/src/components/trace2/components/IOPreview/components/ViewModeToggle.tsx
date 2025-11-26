import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

export type ViewMode = "pretty" | "json";

export interface ViewModeToggleProps {
  selectedView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  compensateScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function ViewModeToggle({
  selectedView,
  onViewChange,
  compensateScrollRef,
}: ViewModeToggleProps) {
  return (
    <div className="flex w-full flex-row justify-start">
      <Tabs
        ref={compensateScrollRef}
        className="h-fit py-0.5"
        value={selectedView}
        onValueChange={(value) => onViewChange(value as ViewMode)}
      >
        <TabsList className="h-fit p-0.5">
          <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
            Formatted
          </TabsTrigger>
          <TabsTrigger value="json" className="h-fit px-1 text-xs">
            JSON
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
