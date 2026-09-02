import { Tabs } from "@/src/components/ui/tabs";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useJsonBetaToggle } from "@/src/features/traces/hooks/useJsonBetaToggle";

export type ViewMode = "pretty" | "pretty-beta" | "json" | "json-beta";

export interface ViewModeToggleProps {
  selectedView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  compensateScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Admin-only normalized-parser formatted view. */
  showPrettyBeta?: boolean;
  /** Surface supplies a precomputed legacy parse, so the beta parser cannot
   * apply here: the trigger renders disabled with an explanation. */
  prettyBetaDisabled?: boolean;
}

export function ViewModeToggle({
  selectedView,
  onViewChange,
  compensateScrollRef,
  showPrettyBeta = false,
  prettyBetaDisabled = false,
}: ViewModeToggleProps) {
  const {
    jsonBetaEnabled,
    selectedViewTab,
    handleViewTabChange,
    handleBetaToggle,
  } = useJsonBetaToggle(
    selectedView,
    onViewChange,
    showPrettyBeta && !prettyBetaDisabled,
  );

  return (
    <div className="flex w-full flex-row items-center justify-start gap-1.5">
      <span className="h-fit py-0.5">
        <Tabs
          ref={compensateScrollRef}
          value={selectedViewTab}
          onValueChange={handleViewTabChange}
        >
          <Tabs.List size="sm">
            {showPrettyBeta &&
              (prettyBetaDisabled ? (
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Tabs.Trigger value="pretty-beta" size="sm" disabled>
                      Normalized (beta)
                    </Tabs.Trigger>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" className="w-64 text-sm">
                    Shown with the standard parser for now — beta parsing is not
                    applied to precomputed views yet.
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <Tabs.Trigger value="pretty-beta" size="sm">
                  Normalized (beta)
                </Tabs.Trigger>
              ))}
            <Tabs.Trigger value="pretty" size="sm">
              Formatted
            </Tabs.Trigger>
            <Tabs.Trigger value="json" size="sm">
              JSON
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      </span>
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
