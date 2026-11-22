import { useId, useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { Filter, PanelLeftClose } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { cn } from "@/src/utils/tailwind";
import { AvailableExperimentFilters } from "./AvailableExperimentFilters";
import { ExperimentFilterAddButton } from "./ExperimentFilterAddButton";
import { ExperimentFilterBlock } from "./ExperimentFilterBlock";
import { experimentFilterToDraft } from "./experimentFilterEditing";
import {
  type ExperimentFilterApply,
  type ExperimentFilterOptions,
  type ExperimentFilterTarget,
} from "./experimentFilterTypes";

export function ExperimentFilterSidebarView({
  filters,
  onApply,
  onRemove,
  onClearAll,
  targets,
  options,
  legacyDefaultTarget,
  optionsError,
  onRetryOptions,
  layout,
  isCollapsed,
  onOpenChange,
  onActiveOnlyChange,
}: ExperimentFilterSidebarViewProps) {
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const activeOnlyId = useId();
  const filterBlocks = prepareFilterBlocks(filters);

  function handleOpen() {
    onOpenChange(true);
  }
  function handleCollapse() {
    onOpenChange(false);
  }
  function handleActiveOnlyChange(checked: boolean | "indeterminate") {
    const enabled = checked === true;
    setShowOnlyActive(enabled);
    onActiveOnlyChange(enabled);
  }

  if (isCollapsed)
    return (
      <div className="flex h-full justify-center pt-2">
        <IconButton
          icon={Filter}
          label="Open filters"
          size="md"
          onClick={handleOpen}
        />
      </div>
    );

  return (
    <>
      <aside
        aria-label="Experiment filters"
        className={cn(
          "flex min-w-0 flex-col",
          layout === "panel" && "h-full overflow-hidden",
        )}
      >
        {layout === "panel" && (
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <span className="text-sm font-bold">
              Filters{filters.length > 0 && ` (${filters.length})`}
            </span>
            <IconButton
              icon={PanelLeftClose}
              label="Collapse filters"
              size="sm"
              onClick={handleCollapse}
            />
          </div>
        )}
        <div
          className={cn(
            "flex flex-col gap-3 p-3",
            layout === "panel" && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={activeOnlyId}
              className="text-muted-foreground flex items-center gap-2 text-xs"
            >
              <Checkbox
                id={activeOnlyId}
                checked={showOnlyActive}
                onCheckedChange={handleActiveOnlyChange}
              />
              Show only active
            </label>
            {filters.length > 0 && (
              <Button
                text="Clear all"
                variant="ghost"
                size="sm"
                onClick={onClearAll}
              />
            )}
          </div>
          {optionsError && (
            <div role="alert" className="flex flex-col gap-2 text-xs">
              <p>{optionsError}</p>
              <Button
                text="Retry options"
                variant="secondary"
                size="sm"
                onClick={onRetryOptions}
              />
            </div>
          )}
          {filters.length === 0 && (
            <p className="text-muted-foreground py-3 text-center text-xs">
              No active filters.
            </p>
          )}
          {filterBlocks.map(({ filter, index, key }) => (
            <ExperimentFilterBlock
              key={`${key}:${filter.target ?? legacyDefaultTarget}`}
              initialDraft={experimentFilterToDraft(
                filter,
                legacyDefaultTarget,
              )}
              index={index}
              targets={targets}
              options={options}
              optionsError={optionsError}
              onApply={onApply}
              onRemove={onRemove}
            />
          ))}
          {!showOnlyActive && (
            <AvailableExperimentFilters
              options={options}
              optionsError={optionsError}
              onAdd={onApply}
              portalContainer={portalContainer}
            />
          )}
          <ExperimentFilterAddButton
            options={options}
            optionsError={optionsError}
            onAdd={onApply}
            portalContainer={portalContainer}
          />
        </div>
      </aside>
      {layout === "inline" && (
        <div data-layer="popover" ref={setPortalContainer} />
      )}
    </>
  );
}

function prepareFilterBlocks(filters: FilterState) {
  const occurrences = new Map<string, number>();
  return filters.map((filter, index) => {
    const identity = JSON.stringify(filter);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { filter, index, key: `${identity}:${occurrence}` };
  });
}

type ExperimentFilterSidebarViewProps = {
  filters: FilterState;
  onApply: ExperimentFilterApply;
  onRemove: (index: number) => void;
  onClearAll: () => void;
  targets: readonly ExperimentFilterTarget[];
  options: ExperimentFilterOptions | undefined;
  legacyDefaultTarget: string;
  optionsError: string | null;
  onRetryOptions: () => void;
  layout: "panel" | "inline";
  isCollapsed: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveOnlyChange: (enabled: boolean) => void;
};
