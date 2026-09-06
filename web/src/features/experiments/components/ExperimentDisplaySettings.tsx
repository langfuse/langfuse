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
import { useTranslations } from "next-intl";
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
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("display.layout")}</DropdownMenuLabel>
        <OptionItem
          selected={layout === "list"}
          onSelect={() => onLayoutChange("list")}
        >
          {t("display.diffRows")}
        </OptionItem>
        <OptionItem
          selected={layout === "grid"}
          onSelect={() => onLayoutChange("grid")}
        >
          {t("display.sideBySide")}
        </OptionItem>
        <OptionItem
          selected={layout === "matrix"}
          onSelect={() => onLayoutChange("matrix")}
        >
          {t("display.scoreMatrix")}
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("display.diff")}</DropdownMenuLabel>
        <OptionItem
          selected={diffMode === "comparison"}
          onSelect={() => onDiffModeChange("comparison")}
        >
          {t("display.comparisonToBaseline")}
        </OptionItem>
        <OptionItem
          selected={diffMode === "expected"}
          onSelect={() => onDiffModeChange("expected")}
        >
          {t("display.expectedToOutput")}
        </OptionItem>
        <OptionItem
          selected={diffMode === "off"}
          onSelect={() => onDiffModeChange("off")}
        >
          {t("display.valuesOnly")}
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("display.itemVisibility")}</DropdownMenuLabel>
        <OptionItem
          selected={itemVisibility === "baseline-only"}
          disabled={isItemVisibilityDisabled}
          onSelect={() => onItemVisibilityChange("baseline-only")}
        >
          {t("display.baselineItemsOnly")}
        </OptionItem>
        <OptionItem
          selected={itemVisibility === "all"}
          disabled={isItemVisibilityDisabled}
          onSelect={() => onItemVisibilityChange("all")}
        >
          {t("display.allItems")}
        </OptionItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("display.format")}</DropdownMenuLabel>
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
          {t("display.formatted")}
        </OptionItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
