import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useJsonBetaToggle } from "@/src/features/traces/hooks/useJsonBetaToggle";
import {
  type JsonViewPreference,
  PINNED_STYLE_JSON_VIEWS,
  pinnedStyleJsonViewLabel,
} from "@/src/components/ui/jsonViewPreference";

export type ViewMode = JsonViewPreference;

export interface ViewModeToggleProps {
  selectedView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  compensateScrollRef: React.RefObject<HTMLDivElement | null>;
}

/** Review-only segments after Formatted / JSON: the Formatted view with one
    table style direction pinned. Removed before merge. */
export function PinnedStyleViewTriggers() {
  return (
    <>
      {PINNED_STYLE_JSON_VIEWS.map((view) => (
        <Tabs.Trigger
          key={view}
          value={view}
          size="sm"
          label={pinnedStyleJsonViewLabel(view)}
        />
      ))}
    </>
  );
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
            <PinnedStyleViewTriggers />
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
