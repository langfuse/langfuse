import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  GripVerticalIcon,
  MoreVerticalIcon,
  Info,
  type IconComponent,
} from "@langfuse/icons";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { useFittingCount } from "@/src/components/design-system/internal/useFittingCount";
import {
  VisualizationFrame,
  type Visualization,
} from "../charts/internal/VisualizationFrame/VisualizationFrame";

export type DataCardActions = {
  draggable?: boolean;
  buttons?: {
    id: string;
    label: string;
    icon: IconComponent;
    onClick: () => void;
    disabled?: boolean;
  }[];
  menu?: DropdownMenuItemDefinition[];
};

function ExpandableDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () =>
      setIsOverflowing(content.scrollHeight > container.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-1">
      {isOverflowing || expanded ? (
        <div className="shrink-0">
          <ExpandToggle
            expanded={expanded}
            onExpandedChange={setExpanded}
            controls={contentId}
            label="Read more"
            expandedLabel="Read less"
            variant="underline"
          />
        </div>
      ) : null}
      <div
        id={contentId}
        ref={containerRef}
        className={
          expanded
            ? "max-h-32 min-h-0 overflow-y-auto"
            : "max-h-10 min-h-0 overflow-hidden"
        }
        tabIndex={expanded ? 0 : undefined}
        role={expanded ? "region" : undefined}
        aria-label={expanded ? "Full widget description" : undefined}
      >
        <p
          ref={contentRef}
          className="text-muted-foreground text-sm break-words"
        >
          {description}
        </p>
      </div>
    </div>
  );
}

export function DataCard({
  title,
  description,
  descriptionBehavior = "truncate",
  descriptor,
  badge,
  filter,
  controls = [],
  tabs,
  actions,
  content,
  metric,
}: {
  title: string;
  description?: string | null;
  descriptionBehavior?: "truncate" | "expandable";
  descriptor?: ReactNode;
  badge?: { text: string; description: string };
  /**
   * What the card is filtered by, chosen elsewhere on the page (e.g. selected
   * table rows); each item can be removed, but nothing is picked here.
   */
  filter?: {
    label: string;
    items: { value: string; label: string }[];
    onRemove: (value: string) => void;
  };
  controls?: ({
    id: string;
    label: string;
  } & (
    | ({ type: "multiselect" } & Pick<
        ComponentProps<typeof MultiSelectTagInput<string>>,
        | "value"
        | "options"
        | "onValueChange"
        | "placeholder"
        | "searchPlaceholder"
        | "emptyMessage"
        | "selectAllLabel"
        | "disabled"
        | "noCapture"
      >)
    | ({ type: "select" } & Pick<
        ComponentProps<typeof SelectInput<string>>,
        "value" | "options" | "onValueChange" | "disabled" | "noCapture"
      >)
  ))[];
  tabs?: {
    value: string;
    options: { value: string; label: string }[];
    onValueChange: (value: string) => void;
    /**
     * `underline` (default): tabs below the header, for distinct views.
     * `toggle`: a compact switch in the header, for options of one view such as its bucket size.
     */
    variant?: "underline" | "toggle";
  };
  actions?: DataCardActions;
  content: Visualization;
  metric?: {
    value: string | number;
    description?: string;
    documentation?: ComponentProps<"button">;
  };
}) {
  const hasData = !["loading", "empty", "error", "confirmation"].includes(
    content.type,
  );
  const chart = <VisualizationFrame content={content} />;
  const cardContent = (
    <div
      className="relative flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0"
      aria-busy={content.type === "loading"}
    >
      {(hasData || content.type === "loading") && metric && (
        <div
          aria-hidden={content.type === "loading" ? true : undefined}
          inert={content.type === "loading" ? true : undefined}
          className={
            content.type === "loading"
              ? "animate-in flex flex-col items-start opacity-50 blur-xs select-none"
              : "animate-in flex flex-col items-start"
          }
        >
          <div className="text-3xl font-bold">{metric.value}</div>
          {(metric.description || metric.documentation) && (
            <div className="flex min-w-0 items-center gap-1">
              {metric.description && (
                <p className="text-muted-foreground text-sm">
                  {metric.description}
                </p>
              )}
              {metric.documentation && (
                <button
                  type="button"
                  aria-label="More information"
                  className="text-muted-foreground inline-flex cursor-help items-center px-1 whitespace-nowrap"
                  {...metric.documentation}
                >
                  <Info size="sm" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!hasData || content.type === "table" ? (
        chart
      ) : (
        <div className="relative h-80 min-h-0 w-full flex-auto">
          <div className="absolute inset-0">{chart}</div>
        </div>
      )}
    </div>
  );

  const tabTriggers = tabs?.options.map((option) => (
    <Tabs.Trigger
      key={option.value}
      value={option.value}
      label={option.label}
    />
  ));
  const isToggle = tabs?.variant === "toggle";

  const header = (
    <div
      className={
        descriptionBehavior === "expandable"
          ? "flex max-h-[60%] min-h-0 shrink-0 flex-col p-4"
          : "flex shrink-0 flex-col p-4"
      }
    >
      <div
        className={
          descriptionBehavior === "expandable"
            ? "flex h-5 min-w-0 shrink-0 items-center justify-between gap-3"
            : "flex h-5 min-w-0 items-center justify-between gap-3"
        }
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3
              className="truncate text-base leading-5 font-bold tracking-tight"
              title={title}
            >
              {title}
            </h3>
            {badge && (
              <Badge
                color="filled"
                text={badge.text}
                title={badge.description}
              />
            )}
          </div>
        </div>
        <div className="flex max-w-2/3 min-w-0 items-center justify-end gap-2">
          {filter && filter.items.length > 0 && <FilterTags filter={filter} />}
          {tabs && isToggle && (
            <div className="flex shrink-0">
              <Tabs.List
                variant="inset"
                size="sm"
                aria-label={`${title} options`}
              >
                {tabTriggers}
              </Tabs.List>
            </div>
          )}
          {controls.map((control) => (
            <div key={control.id} className="w-80 min-w-0">
              {control.type === "multiselect" ? (
                <MultiSelectTagInput
                  aria-label={control.label}
                  value={control.value}
                  options={control.options}
                  onValueChange={control.onValueChange}
                  placeholder={control.placeholder}
                  searchPlaceholder={control.searchPlaceholder}
                  emptyMessage={control.emptyMessage}
                  selectAllLabel={control.selectAllLabel}
                  disabled={control.disabled}
                  noCapture={control.noCapture}
                />
              ) : (
                <SelectInput
                  noCapture={control.noCapture}
                  aria-label={control.label}
                  placeholder={control.label}
                  value={control.value}
                  disabled={control.disabled}
                  onValueChange={control.onValueChange}
                  options={control.options}
                />
              )}
            </div>
          ))}
          {actions && (
            <div className="bg-card text-muted-foreground pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border p-1 opacity-0 shadow-sm group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-hover/widget:pointer-events-auto group-hover/widget:opacity-100 has-aria-expanded:pointer-events-auto has-aria-expanded:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:opacity-100">
              {actions.draggable && (
                <GripVerticalIcon
                  size="base"
                  __rawClassName="drag-handle hidden cursor-grab active:cursor-grabbing lg:block"
                />
              )}
              {actions.buttons?.map(
                ({ id, label, icon: Icon, onClick, disabled }) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={onClick}
                    disabled={disabled}
                    className="hover:bg-accent hover:text-foreground focus-visible:ring-ring grid size-7 cursor-pointer place-items-center rounded-sm focus-visible:ring-2 disabled:opacity-50 [@media(pointer:coarse)]:size-9"
                  >
                    <Icon size="base" />
                  </button>
                ),
              )}
              {actions.menu && actions.menu.length > 0 && (
                <DropdownMenu placement="bottom-end" items={actions.menu}>
                  {({ getTriggerProps }) => (
                    <button
                      type="button"
                      aria-label="Widget actions"
                      className="hover:text-foreground"
                      {...getTriggerProps()}
                    >
                      <MoreVerticalIcon size="base" />
                    </button>
                  )}
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>
      {description && descriptionBehavior === "expandable" && (
        <ExpandableDescription key={description} description={description} />
      )}
      {description && descriptionBehavior === "truncate" && (
        <p
          className="text-muted-foreground truncate text-sm"
          title={description}
        >
          {description}
        </p>
      )}
      {descriptor && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          {descriptor}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-background text-card-foreground group relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border shadow-xs">
      {tabs ? (
        <Tabs
          layout="fill"
          value={tabs.value}
          onValueChange={tabs.onValueChange}
        >
          {header}
          {!isToggle && (
            <div className="mb-4 h-9 shrink-0 border-b px-4 sm:px-0">
              <Tabs.List
                variant="underline"
                overflow="menu"
                aria-label={`${title} tabs`}
              >
                {tabTriggers}
              </Tabs.List>
            </div>
          )}
          <Tabs.Content value={tabs.value} layout="fill">
            {cardContent}
          </Tabs.Content>
        </Tabs>
      ) : (
        <>
          {header}
          {cardContent}
        </>
      )}
    </div>
  );
}

function FilterTags({
  filter,
}: {
  filter: NonNullable<ComponentProps<typeof DataCard>["filter"]>;
}) {
  const { listRef, probeRef, fittingCount } = useFittingCount({
    itemCount: filter.items.length,
    itemsKey: filter.items
      .map(({ value, label }) => `${value}:${label}`)
      .join("\u0000"),
  });
  const hiddenCount = filter.items.length - fittingCount;

  return (
    <div
      ref={listRef}
      className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]"
    >
      {/* Invisible copies give the row its natural width and each tag's width to measure. */}
      <div
        ref={probeRef}
        aria-hidden
        inert
        className="invisible col-start-1 row-start-1 flex h-0 gap-1 overflow-hidden"
      >
        {filter.items.map((item) => (
          <span key={item.value} className="flex max-w-48 min-w-10 shrink-0">
            <FilterTag item={item} onRemove={filter.onRemove} />
          </span>
        ))}
        <span className="flex shrink-0">
          <Tag text={`+${filter.items.length}`} />
        </span>
      </div>
      <div className="col-start-1 row-start-1 flex min-w-0 justify-end">
        <div
          role="group"
          aria-label={filter.label}
          // Same height as the toggle beside it so both center on one line.
          className="flex h-6 min-w-0 items-center gap-1"
        >
          {filter.items.slice(0, fittingCount).map((item) => (
            <span key={item.value} className="flex max-w-48 min-w-10 shrink">
              <FilterTag item={item} onRemove={filter.onRemove} />
            </span>
          ))}
          {hiddenCount > 0 && (
            <span
              className="flex shrink-0"
              title={`${hiddenCount} more selected`}
            >
              <Tag text={`+${hiddenCount}`} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTag({
  item,
  onRemove,
}: {
  item: { value: string; label: string };
  onRemove: (value: string) => void;
}) {
  const handleRemove = () => onRemove(item.value);
  return <Tag text={item.label} remove={{ onRemove: handleRemove }} />;
}
