"use client";

import { type ReactNode } from "react";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { CHART_TRANSITION_DURATION } from "@/src/components/design-system/charts/constants";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";
import { cn } from "@/src/utils/tailwind";
import { OverflowList } from "@/src/components/design-system/OverflowList/OverflowList";

export type ChartLegendItem = {
  id: string;
  label: ReactNode;
  color: string;
  value?: { label: string; value: ReactNode };
  muted?: boolean;
  action?: {
    label: string;
    pressed: boolean;
    onClick: () => void;
  };
};

const LEGEND_PADDING = "min-w-0 shrink-0 px-4 py-2";

function LegendItem({ item }: { item: ChartLegendItem }) {
  const plainTextLabel =
    typeof item.label === "string"
      ? item.label
      : getPlainTextFromReactNode(item.label);
  const plainTextValue = item.value
    ? getPlainTextFromReactNode(item.value.value)
    : undefined;
  const title = `${plainTextLabel ?? ""}${
    item.value && plainTextValue
      ? ` (${item.value.label}: ${plainTextValue})`
      : ""
  }`;
  const content = (
    <>
      <div
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: item.color }}
      />
      <span
        className="text-muted-foreground truncate"
        title={title || undefined}
      >
        {item.label}
        {item.value !== undefined ? (
          <>
            {" "}
            ({item.value.label}: {item.value.value})
          </>
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "flex max-w-full min-w-0 items-center gap-1.5 text-xs whitespace-nowrap transition-opacity",
    item.muted && "opacity-40",
  );

  return item.action ? (
    <button
      type="button"
      onClick={item.action.onClick}
      className={cn(className, "cursor-pointer hover:opacity-80")}
      style={{ transitionDuration: CHART_TRANSITION_DURATION }}
      aria-pressed={item.action.pressed}
      aria-label={item.action.label}
    >
      {content}
    </button>
  ) : (
    <div
      className={className}
      style={{ transitionDuration: CHART_TRANSITION_DURATION }}
    >
      {content}
    </div>
  );
}

export function ChartLegend({
  items,
  selectionActions,
}: {
  items: ChartLegendItem[];
  selectionActions?: {
    allSelected: boolean;
    onSelectAll: () => void;
    onDeselectAll: () => void;
  };
}) {
  return (
    <div className={cn(LEGEND_PADDING, "flex justify-center")}>
      <OverflowList
        alignment="center"
        additionalOverflowCount={0}
        spacing="comfortable"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item, { getItemProps }) => (
          <span {...getItemProps()}>
            <LegendItem item={item} />
          </span>
        )}
        renderOverflow={({ hiddenItems }) => {
          return (
            <DropdownMenu
              title="Additional series"
              items={[
                ...(selectionActions
                  ? [
                      {
                        id: "all-series",
                        type: "item" as const,
                        title: selectionActions.allSelected
                          ? "Deselect all"
                          : "Select all",
                        onClick: selectionActions.allSelected
                          ? selectionActions.onDeselectAll
                          : selectionActions.onSelectAll,
                      },
                      {
                        id: "all-series-separator",
                        type: "separator" as const,
                      },
                    ]
                  : []),
                ...hiddenItems.map((item) => ({
                  id: item.id,
                  type: "item" as const,
                  title: `${
                    typeof item.label === "string"
                      ? item.label
                      : (item.action?.label ?? item.id)
                  }${
                    item.value &&
                    (typeof item.value.value === "string" ||
                      typeof item.value.value === "number")
                      ? ` (${item.value.label}: ${item.value.value})`
                      : ""
                  }`,
                  disabled: item.action
                    ? undefined
                    : { reason: "This legend item is not interactive" },
                  onClick: item.action?.onClick ?? (() => undefined),
                })),
              ]}
            >
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
                  aria-label={`Show ${hiddenItems.length} additional series`}
                  {...getTriggerProps()}
                >
                  +{hiddenItems.length}
                </button>
              )}
            </DropdownMenu>
          );
        }}
      />
    </div>
  );
}
