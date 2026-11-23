import { type ComponentProps } from "react";
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
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { OverflowList } from "@/src/components/design-system/OverflowList/OverflowList";
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

export function DataCard({
  title,
  description,
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
      >)
    | ({ type: "select" } & Pick<
        ComponentProps<typeof SelectInput<string>>,
        "value" | "options" | "onValueChange" | "disabled"
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
    <div className="flex shrink-0 flex-col p-4">
      <div className="flex h-5 min-w-0 items-center justify-between gap-3">
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
                />
              ) : (
                <SelectInput
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
            <div className="bg-card text-muted-foreground absolute top-2 right-2 z-1 flex items-center gap-2 rounded-md border px-2 py-1 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
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
                    className="hover:text-foreground disabled:opacity-50"
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
      {description && (
        <p
          className="text-muted-foreground truncate text-sm"
          title={description}
        >
          {description}
        </p>
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
  return (
    <div
      role="group"
      aria-label={filter.label}
      className="flex h-6 min-w-0 flex-1 items-center"
    >
      <div className="flex w-full min-w-0 justify-end">
        <OverflowList
          alignment="end"
          additionalOverflowCount={0}
          spacing="tight"
          minVisible={1}
          items={filter.items}
          getKey={(item) => item.value}
          renderItem={(item, { getItemProps }) => (
            <span {...getItemProps({ className: "max-w-48 min-w-10 shrink" })}>
              <FilterTag item={item} onRemove={filter.onRemove} />
            </span>
          )}
          renderOverflow={({ overflowItemCount }) => (
            <span
              className="flex shrink-0"
              title={`${overflowItemCount} more selected`}
            >
              <Tag text={`+${overflowItemCount}`} />
            </span>
          )}
        />
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
