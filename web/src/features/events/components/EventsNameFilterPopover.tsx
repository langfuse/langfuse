import { type ComponentProps } from "react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { CategoricalFacet } from "@/src/components/table/data-table-controls";
import { PopoverController } from "@/src/components/ui/popover";
import { type CategoricalUIFilter } from "@/src/features/filters/hooks/useSidebarFilterState";

export function EventsNameFilterPopover({
  filter,
  onAfterOpen,
  children,
}: {
  filter: CategoricalUIFilter;
  onAfterOpen: () => void;
  children: ComponentProps<typeof PopoverController>["children"];
}) {
  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-80 p-2"
      disabled={filter.isDisabled}
      modal={false}
      onOpenChange={(open) => {
        if (open) onAfterOpen();
      }}
      renderContent={() => (
        <Accordion type="multiple" defaultValue={[filter.column]}>
          <CategoricalFacet
            filterKey={filter.column}
            label={filter.label}
            isV4
            options={filter.options}
            counts={filter.counts}
            loading={filter.loading}
            value={filter.value}
            onChange={filter.onChange}
            onOnlyChange={filter.onOnlyChange}
            isActive={filter.isActive}
            onReset={filter.onReset}
            operator={filter.operator}
            onOperatorChange={filter.onOperatorChange}
            textFilters={filter.textFilters}
            onTextFilterAdd={filter.onTextFilterAdd}
            onTextFilterRemove={filter.onTextFilterRemove}
          />
        </Accordion>
      )}
    >
      {children}
    </PopoverController>
  );
}
