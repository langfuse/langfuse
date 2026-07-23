/**
 * SidePanelToolbar - slim control row for the details side panel, replacing
 * the old TabsBar after the Scores tab's removal (only Preview remained, so
 * the tab machinery collapsed like annotation mode always did).
 *
 * Hosts, right-aligned:
 * - Formatted/JSON view toggle (+ the JSON "Beta" switch when JSON is active)
 * - "Correct" toggle for the corrected-output editor. The button indicates an
 *   EXISTING correction (dot + "Has correction" title) so data hidden behind
 *   the toggle stays discoverable.
 */

import { PencilLine } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { cn } from "@/src/utils/tailwind";

export interface SidePanelToolbarProps {
  /** Hide the Formatted/JSON toggle (e.g. pretty view unavailable). */
  showViewToggle: boolean;
  selectedViewTab: "pretty" | "json";
  onViewTabChange: (tab: string) => void;
  jsonBetaEnabled: boolean;
  onBetaToggle: (enabled: boolean) => void;
  /** Correct toggle (undefined hides it, e.g. non-generations, no access). */
  correction?: {
    isOpen: boolean;
    hasExisting: boolean;
    onToggle: () => void;
  };
}

export function SidePanelToolbar({
  showViewToggle,
  selectedViewTab,
  onViewTabChange,
  jsonBetaEnabled,
  onBetaToggle,
  correction,
}: SidePanelToolbarProps) {
  if (!showViewToggle && !correction) return null;

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1">
      {showViewToggle && (
        <>
          <Tabs
            className="h-fit"
            value={selectedViewTab}
            onValueChange={onViewTabChange}
          >
            <TabsList className="h-fit py-0.5">
              <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                Formatted
              </TabsTrigger>
              <TabsTrigger value="json" className="h-fit px-1 text-xs">
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Beta toggle - only show when JSON is selected */}
          {selectedViewTab === "json" && (
            <div className="mr-1 flex items-center gap-1.5">
              <Switch
                size="sm"
                checked={jsonBetaEnabled}
                onCheckedChange={onBetaToggle}
              />
              <span className="text-muted-foreground text-xs">Beta</span>
            </div>
          )}
        </>
      )}
      {correction && (
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "text-muted-foreground h-6 px-2 text-[11px]",
            correction.isOpen && "bg-accent",
          )}
          title={correction.hasExisting ? "Has correction" : "Correct output"}
          aria-pressed={correction.isOpen}
          onClick={correction.onToggle}
        >
          <PencilLine className="mr-1 h-3 w-3" />
          Correct
          {correction.hasExisting && (
            <span
              aria-hidden
              className="bg-primary ml-1.5 h-1.5 w-1.5 rounded-full"
            />
          )}
        </Button>
      )}
    </div>
  );
}
