/* eslint-disable @repo/no-abstracted-overlay-trigger */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Settings2, Check } from "lucide-react";
import { type IoRenderMode } from "@/src/components/table/data-table-io-render-mode-switch";
import {
  type ExperimentDiffMode,
  type ExperimentResultsLayout,
} from "@/src/features/experiments/hooks/useExperimentResultsState";

type ExperimentDisplaySettingsProps = {
  layout: ExperimentResultsLayout;
  onLayoutChange: (layout: ExperimentResultsLayout) => void;
  diffMode: ExperimentDiffMode;
  onDiffModeChange: (diffMode: ExperimentDiffMode) => void;
  itemVisibility: "baseline-only" | "all";
  onItemVisibilityChange: (visibility: "baseline-only" | "all") => void;
  hasComparisons: boolean;
  hasBaseline: boolean;
  ioRenderMode: IoRenderMode;
  onIoRenderModeChange: (mode: IoRenderMode) => void;
};

/** A menu row that reads as a radio option. */
const OptionItem = ({
  selected,
  disabled,
  onSelect,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) => (
  <DropdownMenuItem onClick={onSelect} disabled={disabled}>
    {selected ? (
      <Check className="mr-2 h-4 w-4 shrink-0" />
    ) : (
      <span className="mr-2 h-4 w-4 shrink-0" />
    )}
    {children}
  </DropdownMenuItem>
);

export function ExperimentDisplaySettings({
  layout,
  onLayoutChange,
  diffMode,
  onDiffModeChange,
  itemVisibility,
  onItemVisibilityChange,
  hasComparisons,
  hasBaseline,
  ioRenderMode,
  onIoRenderModeChange,
}: ExperimentDisplaySettingsProps) {
  const isItemVisibilityDisabled = !hasComparisons || !hasBaseline;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Settings2 className="h-4 w-4" />
          <span className="ml-2 hidden md:inline">Display</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <OptionItem
          selected={layout === "list"}
          onSelect={() => onLayoutChange("list")}
        >
          Diff — one row per item
        </OptionItem>
        <OptionItem
          selected={layout === "grid"}
          onSelect={() => onLayoutChange("grid")}
        >
          Side by side — a column per experiment
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Diff</DropdownMenuLabel>
        <OptionItem
          selected={diffMode === "comparison"}
          onSelect={() => onDiffModeChange("comparison")}
        >
          Comparison → Baseline
        </OptionItem>
        <OptionItem
          selected={diffMode === "expected"}
          onSelect={() => onDiffModeChange("expected")}
        >
          Expected → Output
        </OptionItem>
        <OptionItem
          selected={diffMode === "off"}
          onSelect={() => onDiffModeChange("off")}
        >
          Off — values only
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Item Visibility</DropdownMenuLabel>
        <OptionItem
          selected={itemVisibility === "baseline-only"}
          disabled={isItemVisibilityDisabled}
          onSelect={() => onItemVisibilityChange("baseline-only")}
        >
          Show only items in baseline
        </OptionItem>
        <OptionItem
          selected={itemVisibility === "all"}
          disabled={isItemVisibilityDisabled}
          onSelect={() => onItemVisibilityChange("all")}
        >
          Show all items
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Format</DropdownMenuLabel>
        <OptionItem
          selected={ioRenderMode === "json"}
          onSelect={() => onIoRenderModeChange("json")}
        >
          JSON
        </OptionItem>
        <OptionItem
          selected={ioRenderMode === "text"}
          onSelect={() => onIoRenderModeChange("text")}
        >
          Formatted
        </OptionItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
