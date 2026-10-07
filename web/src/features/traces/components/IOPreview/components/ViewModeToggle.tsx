import { ToggleGroup } from "@/src/components/design-system/ToggleGroup/ToggleGroup";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useJsonBetaToggle } from "@/src/features/traces/hooks/useJsonBetaToggle";
import { type JsonViewPreference } from "@/src/components/ui/jsonViewPreference";

export type ViewMode = JsonViewPreference;

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
        <ToggleGroup
          ref={compensateScrollRef}
          value={selectedViewTab}
          onValueChange={handleViewTabChange}
        >
          <ToggleGroup.List size="sm">
            <ToggleGroup.Trigger value="pretty" size="sm" label="Formatted" />
            <ToggleGroup.Trigger value="json" size="sm" label="Raw" />
          </ToggleGroup.List>
        </ToggleGroup>
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
