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
import { useTranslations } from "next-intl";

type ExperimentDisplaySettingsProps = {
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
  itemVisibility: "baseline-only" | "all";
  onItemVisibilityChange: (visibility: "baseline-only" | "all") => void;
  hasComparisons: boolean;
  hasBaseline: boolean;
  ioRenderMode: IoRenderMode;
  onIoRenderModeChange: (mode: IoRenderMode) => void;
};

export function ExperimentDisplaySettings({
  layout,
  onLayoutChange,
  itemVisibility,
  onItemVisibilityChange,
  hasComparisons,
  hasBaseline,
  ioRenderMode,
  onIoRenderModeChange,
}: ExperimentDisplaySettingsProps) {
  const t = useTranslations("evaluationAnalytics.experiments");
  const isItemVisibilityDisabled = !hasComparisons || !hasBaseline;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Settings2 className="h-4 w-4" />
          <span className="ml-2 hidden md:inline">{t("display.label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("display.layout")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onLayoutChange("grid")}>
          {layout === "grid" && <Check className="mr-2 h-4 w-4" />}
          {layout !== "grid" && <span className="mr-2 h-4 w-4" />}
          {t("display.grid")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onLayoutChange("list")}>
          {layout === "list" && <Check className="mr-2 h-4 w-4" />}
          {layout !== "list" && <span className="mr-2 h-4 w-4" />}
          {t("display.list")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("display.itemVisibility")}</DropdownMenuLabel>
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
          {t("display.baselineItemsOnly")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onItemVisibilityChange("all")}
          disabled={isItemVisibilityDisabled}
        >
          {itemVisibility === "all" && <Check className="mr-2 h-4 w-4" />}
          {itemVisibility !== "all" && <span className="mr-2 h-4 w-4" />}
          {t("display.allItems")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("display.format")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onIoRenderModeChange("json")}>
          {ioRenderMode === "json" && <Check className="mr-2 h-4 w-4" />}
          {ioRenderMode !== "json" && <span className="mr-2 h-4 w-4" />}
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onIoRenderModeChange("text")}>
          {ioRenderMode === "text" && <Check className="mr-2 h-4 w-4" />}
          {ioRenderMode !== "text" && <span className="mr-2 h-4 w-4" />}
          {t("display.formatted")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
