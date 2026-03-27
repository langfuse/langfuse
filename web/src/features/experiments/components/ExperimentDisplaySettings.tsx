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

type ExperimentDisplaySettingsProps = {
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
  itemVisibility: "baseline-only" | "all";
  onItemVisibilityChange: (visibility: "baseline-only" | "all") => void;
  hasComparisons: boolean;
  hasBaseline: boolean;
};

export function ExperimentDisplaySettings({
  layout,
  onLayoutChange,
  itemVisibility,
  onItemVisibilityChange,
  hasComparisons,
  hasBaseline,
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onLayoutChange("grid")}>
          {layout === "grid" && <Check className="mr-2 h-4 w-4" />}
          {layout !== "grid" && <span className="mr-2 h-4 w-4" />}
          Grid
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onLayoutChange("list")}>
          {layout === "list" && <Check className="mr-2 h-4 w-4" />}
          {layout !== "list" && <span className="mr-2 h-4 w-4" />}
          List
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Item Visibility</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => onItemVisibilityChange("baseline-only")}
          disabled={isItemVisibilityDisabled}
        >
          {itemVisibility === "baseline-only" && (
            <Check className="mr-2 h-4 w-4" />
          )}
          {itemVisibility !== "baseline-only" && (
            <span className="mr-2 h-4 w-4" />
          )}
          Show only items in baseline
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onItemVisibilityChange("all")}
          disabled={isItemVisibilityDisabled}
        >
          {itemVisibility === "all" && <Check className="mr-2 h-4 w-4" />}
          {itemVisibility !== "all" && <span className="mr-2 h-4 w-4" />}
          Show all items
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
