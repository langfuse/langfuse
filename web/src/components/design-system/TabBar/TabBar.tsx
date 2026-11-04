import { type ComponentProps } from "react";
import { Plus, Settings2, EllipsisVertical } from "@langfuse/icons";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

export function TabBar({
  label,
  tabs,
  createAction,
  manageAction,
}: {
  label: string;
  tabs: (Pick<
    ComponentProps<typeof Tabs.Trigger>,
    "value" | "label" | "internal" | "disabled" | "tooltip" | "icon"
  > & {
    value: string;
    label: string;
    menu?: {
      label: string;
      items: ComponentProps<typeof DropdownMenu>["items"];
    };
  })[];
  createAction?: { label: string; onClick: () => void };
  manageAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex shrink-0 items-center border-b px-2">
      <div className="min-w-0 overflow-x-auto">
        <Tabs.List variant="underline" divider="none" aria-label={label}>
          {tabs.map(({ menu, ...tab }) => (
            <div
              key={tab.value}
              className="group/tab relative flex h-full shrink-0 items-center"
            >
              <Tabs.Trigger {...tab} />
              {menu && (
                <DropdownMenu ariaLabel={menu.label} items={menu.items}>
                  {({ getTriggerProps }) => {
                    const triggerProps = getTriggerProps();
                    return (
                      <div
                        className={cn(
                          "bg-background before:to-background absolute top-1/2 right-1 -translate-y-1/2 rounded-sm before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-4 before:bg-linear-to-r before:from-transparent",
                          !triggerProps["aria-expanded"] &&
                            "opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 pointer-coarse:opacity-100",
                        )}
                      >
                        <IconButton
                          icon={EllipsisVertical}
                          label={menu.label}
                          size="xs"
                          {...triggerProps}
                        />
                      </div>
                    );
                  }}
                </DropdownMenu>
              )}
            </div>
          ))}
        </Tabs.List>
      </div>
      {createAction && (
        <Tooltip label={createAction.label}>
          {({ getTriggerProps }) => (
            <IconButton
              icon={Plus}
              label={createAction.label}
              size="sm"
              {...getTriggerProps({ onClick: createAction.onClick })}
            />
          )}
        </Tooltip>
      )}
      {manageAction && (
        <div className="flex flex-1 justify-end pl-2">
          <Tooltip label={manageAction.label}>
            {({ getTriggerProps }) => (
              <IconButton
                icon={Settings2}
                label={manageAction.label}
                size="sm"
                {...getTriggerProps({ onClick: manageAction.onClick })}
              />
            )}
          </Tooltip>
        </div>
      )}
    </div>
  );
}
