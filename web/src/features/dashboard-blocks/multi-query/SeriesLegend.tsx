import { useRef, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { ControlledHoverCard } from "@/src/components/design-system/ControlledHoverCard/ControlledHoverCard";
import { Input } from "@/src/components/design-system/Input/Input";
import { OverflowList } from "@/src/components/design-system/OverflowList/OverflowList";
import { cn } from "@/src/utils/tailwind";

type LegendSeries = { id: string; label: string; color: string };

/** The expanded legend keeps hidden series available to turn back on. */
export function SeriesLegend({
  series,
  hidden,
  onToggle,
}: {
  series: LegendSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const overflowButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasHover = useMediaQuery({ query: "(hover: hover)" });
  const searchable = series.length > 12;
  const matches =
    searchable && search.trim()
      ? series.filter((item) =>
          item.label.toLowerCase().includes(search.trim().toLowerCase()),
        )
      : series;
  const itemButton = (item: LegendSeries, expanded = false) => (
    <button
      type="button"
      aria-pressed={!hidden.has(item.id)}
      onClick={() => onToggle(item.id)}
      title={item.label}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs focus-visible:ring-2",
        expanded ? "w-full" : "max-w-[calc(100cqi_-_3rem)]",
        hidden.has(item.id)
          ? "text-muted-foreground line-through opacity-60"
          : "text-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-sm"
        style={{ backgroundColor: item.color }}
      />
      <span
        className={expanded ? "break-words" : "truncate"}
        title={item.label}
      >
        {item.label}
      </span>
    </button>
  );
  return (
    <ControlledHoverCard
      open={open}
      onOpenChange={(next) => {
        setOpen(next && Boolean(overflowButton.current));
        if (!next) setSearch("");
      }}
      placement="top"
      interaction={hasHover ? "hover" : "click"}
      openDelay={120}
      content={
        <div
          role="group"
          aria-label="All chart series"
          className="ph-no-capture flex max-h-72 w-64 flex-col gap-1 p-1"
        >
          {searchable && (
            <Input
              type="search"
              aria-label="Search series"
              placeholder="Search series"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {matches.map((item) => (
              <div key={item.id}>{itemButton(item, true)}</div>
            ))}
            {!matches.length && (
              <p
                role="status"
                className="text-muted-foreground px-2 py-3 text-xs"
              >
                No matching series
              </p>
            )}
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <div
          {...(hasHover ? getTriggerProps() : {})}
          role="group"
          aria-label="Chart legend"
          className="ph-no-capture @container min-w-0 shrink-0"
        >
          <OverflowList
            items={
              hidden.size
                ? [
                    ...series.filter((item) => !hidden.has(item.id)),
                    ...series.filter((item) => hidden.has(item.id)),
                  ]
                : series
            }
            getKey={(item) => item.id}
            alignment="center"
            spacing="compact"
            additionalOverflowCount={0}
            renderItem={(item, { getItemProps }) => (
              <span {...getItemProps()}>{itemButton(item)}</span>
            )}
            renderOverflow={({ overflowItemCount }) => (
              <button
                {...(hasHover
                  ? { ref: overflowButton, onClick: () => setOpen(true) }
                  : getTriggerProps({ ref: overflowButton }))}
                type="button"
                aria-label="Show all chart series"
                aria-expanded={open}
                className="text-muted-foreground hover:bg-muted cursor-pointer rounded px-1.5 py-1 text-xs"
              >
                +{overflowItemCount}
              </button>
            )}
          />
        </div>
      )}
    </ControlledHoverCard>
  );
}
