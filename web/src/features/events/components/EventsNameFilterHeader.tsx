import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ListFilter } from "@langfuse/icons";
import { CategoricalFacet } from "@/src/components/table/data-table-controls";
import { PopoverController } from "@/src/components/ui/popover";
import { type CategoricalUIFilter } from "@/src/features/filters/hooks/useSidebarFilterState";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function EventsNameFilterHeader({
  label,
  filter,
  tableName,
  onOpen,
}: {
  label: string;
  filter: CategoricalUIFilter;
  tableName: string;
  onOpen: () => void;
}) {
  const capture = usePostHogClientCapture();
  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-80 p-2"
      disabled={filter.isDisabled}
      modal={false}
      onOpenChange={(open) => {
        if (!open) return;
        onOpen();
        capture("table:column_filter_header_click", {
          column: filter.column,
          tableName,
          isV4: true,
        });
      }}
      renderContent={() => (
        <AccordionPrimitive.Root type="multiple" defaultValue={[filter.column]}>
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
        </AccordionPrimitive.Root>
      )}
    >
      {({ Trigger, disabled }) => (
        <Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Filter by ${label.toLowerCase()}`}
            className="hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-hidden"
          >
            <span className="truncate" title={label}>
              {label}
            </span>
            <ListFilter
              size="sm"
              color={filter.isActive ? "foreground" : "muted"}
            />
          </button>
        </Trigger>
      )}
    </PopoverController>
  );
}
