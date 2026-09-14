import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useJsonBetaToggle } from "@/src/features/traces/hooks/useJsonBetaToggle";

export type ViewMode = "pretty" | "json" | "json-beta";

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
  const {
    jsonBetaEnabled,
    selectedViewTab,
    handleViewTabChange,
    handleBetaToggle,
  } = useJsonBetaToggle(selectedView, onViewChange);

  return (
    <div className="flex w-full flex-row items-center justify-start gap-1.5">
      <div className="h-fit py-0.5">
        <Tabs
          ref={compensateScrollRef}
          value={selectedViewTab}
          onValueChange={handleViewTabChange}
        >
          <Tabs.List size="sm">
            <Tabs.Trigger value="pretty" size="sm" label="Formatted" />
            <Tabs.Trigger value="json" size="sm" label="JSON" />
          </Tabs.List>
        </Tabs>
      </div>
      {selectedViewTab === "json" && (
        <div className="flex items-center gap-1.5">
          <Switch
            size="sm"
            checked={jsonBetaEnabled}
            onCheckedChange={handleBetaToggle}
          />
          <span className="text-muted-foreground text-xs">Beta</span>
        </div>
      )}
    </div>
  );
}
