import { type ComponentProps } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { CategoricalFilterContent } from "@/src/components/table/CategoricalFilterContent";
import { PopoverController } from "@/src/components/ui/popover";
import { useCategoricalFilterMode } from "@/src/features/filters/hooks/useCategoricalFilterMode";
import { type CategoricalUIFilter } from "@/src/features/filters/hooks/useSidebarFilterState";

export function EventsNameFilterPopover({
  filter,
  tableName,
  onAfterOpen,
  children,
}: {
  filter: CategoricalUIFilter;
  tableName: string;
  onAfterOpen: () => void;
  children: ComponentProps<typeof PopoverController>["children"];
}) {
  const mode = useCategoricalFilterMode({
    filterKey: filter.column,
    tableName,
    isV4: true,
    textFilters: filter.textFilters,
  });
  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-72 p-0"
      disabled={filter.isDisabled}
      modal={false}
      onOpenChange={(open) => {
        if (open) onAfterOpen();
      }}
      renderContent={() => (
        <div className="py-2">
          {filter.conditionCount !== undefined ? (
            <p className="text-muted-foreground px-3 py-1 text-xs">
              {filter.disabledReason}
            </p>
          ) : (
            <CategoricalFilterContent
              {...mode}
              tableName={tableName}
              filterKey={filter.column}
              options={filter.options}
              counts={filter.counts}
              loading={filter.loading}
              value={filter.value}
              onChange={filter.onChange}
              onOnlyChange={filter.onOnlyChange}
              operator={filter.operator}
              onOperatorChange={filter.onOperatorChange}
              textFilters={filter.textFilters}
              onTextFilterAdd={filter.onTextFilterAdd}
              onTextFilterRemove={filter.onTextFilterRemove}
            />
          )}
          {filter.isActive && (
            <div className="flex justify-end px-3 pt-2">
              <Button
                variant="text"
                size="sm"
                text="Clear filter"
                onClick={filter.onReset}
              />
            </div>
          )}
        </div>
      )}
    >
      {children}
    </PopoverController>
  );
}
