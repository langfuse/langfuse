import { useState, type ComponentProps, type ReactNode } from "react";
import { type FilterState } from "@langfuse/shared";
import { FilterIcon, X } from "@langfuse/icons";
import { FilterBuilderEditor } from "../FilterBuilderEditor/FilterBuilderEditor";
import { FloatingController } from "../FloatingController/FloatingController";
import { DropdownIndicator } from "../DropdownIndicator/DropdownIndicator";
import { InputControl } from "../internal/InputControl/InputControl";

export type FilterSummaryToken = {
  column: string;
  operator: string;
  value: string;
  numericValue: boolean;
};

type EditorProps = ComponentProps<typeof FilterBuilderEditor>;
type EditorAnalyticsEvent = Parameters<
  NonNullable<EditorProps["onAnalyticsEvent"]>
>[0];

export function FilterBuilderDropdown({
  value,
  onChange,
  onAnalyticsEvent,
  renderAddon,
  label = "Filters",
  clearLabel,
  variant = "count",
  summary,
  responsiveSummary = false,
  ...editorProps
}: Pick<EditorProps, "columns" | "getColumnNotice"> & {
  /** Applied filters. An open draft is seeded on open and survives value updates. */
  value: FilterState;
  onChange: EditorProps["onFiltersChange"];
  renderAddon?: (controls: {
    replaceFilters: (filters: FilterState) => void;
  }) => ReactNode;
  onAnalyticsEvent?: (
    event:
      | EditorAnalyticsEvent
      | { type: "opened" }
      | { type: "closed"; filterCount: number },
  ) => void;
  label?: string;
  clearLabel?: string;
} & (
    | { variant?: "count" | "icon"; summary?: never; responsiveSummary?: never }
    | {
        variant: "summary";
        summary: readonly FilterSummaryToken[];
        responsiveSummary?: boolean;
      }
  )) {
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState<{
    filters: FilterState;
    version: number;
  }>();
  const count = value.length;
  const showSummary =
    variant === "summary" && count > 0 && count < 3 && !!summary?.length;

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setReplacement(undefined);
    onAnalyticsEvent?.(
      nextOpen
        ? { type: "opened" }
        : { type: "closed", filterCount: value.length },
    );
  };

  const clear = () => {
    if (open) onOpenChange(false);
    onAnalyticsEvent?.({ type: "cleared", clearedCount: count });
    onChange([]);
  };

  return (
    <FloatingController
      open={open}
      interaction="click"
      placement="bottom-start"
      isScrollable
      onOpenChange={onOpenChange}
      renderContent={(props) => (
        <div
          {...props}
          className="ph-no-capture bg-popover text-popover-foreground grid w-[34rem] max-w-[calc(100vw-2rem)] gap-2 overflow-auto rounded-lg border p-3 shadow-md"
        >
          {renderAddon?.({
            replaceFilters: (filters) => {
              setReplacement((previous) => ({
                filters,
                version: (previous?.version ?? 0) + 1,
              }));
              onChange(filters);
            },
          })}
          <FilterBuilderEditor
            key={replacement?.version ?? 0}
            {...editorProps}
            onFiltersChange={onChange}
            initialFilters={replacement?.filters ?? value}
            onAnalyticsEvent={onAnalyticsEvent}
          />
        </div>
      )}
    >
      {({ getTriggerProps }) =>
        variant === "icon" ? (
          <>
            <button
              {...getTriggerProps()}
              type="button"
              aria-label={count > 0 ? `${label} (${count} applied)` : label}
              className="hover:bg-accent focus-visible:ring-ring relative grid size-8 cursor-pointer place-items-center rounded-sm focus-visible:ring-2"
            >
              <FilterIcon size="base" color="default" />
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className="bg-input absolute top-0 -right-1 rounded-sm px-1 text-xs"
                >
                  {count}
                </span>
              )}
            </button>
            {count > 0 && clearLabel && (
              <button
                type="button"
                aria-label={clearLabel}
                className="hover:bg-accent focus-visible:ring-ring grid size-6 cursor-pointer place-items-center self-center rounded-sm focus-visible:ring-2"
                onClick={clear}
              >
                <X size="sm" color="default" />
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1">
            <InputControl contentLayout="spread" focused={open}>
              <button
                {...getTriggerProps()}
                type="button"
                aria-label={count > 0 ? `${label} (${count})` : label}
                className="min-w-0 cursor-pointer"
              >
                <span className="min-w-0 truncate">
                  {label}
                  {showSummary &&
                    summary.map(
                      ({ column, operator, value, numericValue }, index) => (
                        <span
                          key={index}
                          className={`ph-no-capture bg-secondary ml-2 rounded-sm border border-transparent px-1.5 py-0.5 text-xs whitespace-nowrap ${responsiveSummary ? "hidden @6xl:inline" : "inline"}`}
                        >
                          <span className="text-qlang-field">{column}</span>{" "}
                          <span className="text-muted-foreground">
                            {operator}
                          </span>
                          {value !== "" && (
                            <>
                              {" "}
                              <span
                                className={
                                  numericValue
                                    ? "text-qlang-number"
                                    : "text-qlang-value"
                                }
                              >
                                {value}
                              </span>
                            </>
                          )}
                        </span>
                      ),
                    )}
                  {count > 0 && (!showSummary || responsiveSummary) && (
                    <span className={showSummary ? "@6xl:hidden" : undefined}>
                      {" "}
                      ({count})
                    </span>
                  )}
                </span>
                <DropdownIndicator />
              </button>
            </InputControl>
            {count > 0 && (
              <button
                type="button"
                aria-label={clearLabel ?? "Clear all filters"}
                className="hover:bg-accent cursor-pointer rounded-sm p-1"
                onClick={clear}
              >
                <X size="base" color="default" />
              </button>
            )}
          </div>
        )
      }
    </FloatingController>
  );
}
